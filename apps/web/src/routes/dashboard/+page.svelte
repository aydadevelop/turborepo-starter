<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import { hasAuthenticatedSession } from "$lib/auth-session";
	import { orpc } from "$lib/orpc";

	const sessionQuery = authClient.useSession();
	const privateDataQuery = createQuery(orpc.privateData.queryOptions());

	let reminderTitle = $state("Weekly product check-in");
	let reminderBody = $state("Review active subscriptions and invoices.");
	let reminderIntervalSeconds = $state("3600");
	let reminderRunCount = $state("3");
	let reminderMessage = $state<string | null>(null);
	let reminderError = $state<string | null>(null);

	let chargeAmountCents = $state("9900");
	let chargeDescription = $state("Starter plan renewal");
	let chargeMessage = $state<string | null>(null);
	let chargeError = $state<string | null>(null);

	const scheduleReminderMutation = createMutation(
		orpc.tasks.scheduleRecurringReminder.mutationOptions()
	);
	const mockChargeMutation = createMutation(
		orpc.payments.createMockChargeNotification.mutationOptions()
	);

	$effect(() => {
		if ($sessionQuery.isPending) return;
		if (!hasAuthenticatedSession($sessionQuery.data)) {
			goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
			);
		}
	});

	const submitRecurringReminder = async () => {
		reminderMessage = null;
		reminderError = null;
		try {
			const result = await $scheduleReminderMutation.mutateAsync({
				title: reminderTitle.trim(),
				body: reminderBody.trim() || undefined,
				intervalSeconds: Number(reminderIntervalSeconds),
				runCount: Number(reminderRunCount),
				initialDelaySeconds: 0,
				severity: "info",
			});
			reminderMessage = `Queued task ${result.taskId.slice(0, 8)} (${result.runCount} runs).`;
		} catch (error) {
			reminderError =
				error instanceof Error
					? error.message
					: "Failed to schedule recurring reminder.";
		}
	};

	const submitMockCharge = async () => {
		chargeMessage = null;
		chargeError = null;
		try {
			const result = await $mockChargeMutation.mutateAsync({
				amountCents: Number(chargeAmountCents),
				currency: "USD",
				description: chargeDescription.trim(),
			});
			chargeMessage = result.queued
				? "Queued payment notification."
				: "Payment event stored (queue unavailable in this runtime).";
		} catch (error) {
			chargeError =
				error instanceof Error
					? error.message
					: "Failed to create mock charge notification.";
		}
	};
</script>

{#if $sessionQuery.isPending}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if !hasAuthenticatedSession($sessionQuery.data)}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Redirecting to login...</p>
	</div>
{:else}
	<div class="mx-auto max-w-3xl p-6 space-y-6">
		<h1 class="text-3xl font-bold">Dashboard</h1>

		<Card.Root>
			<Card.Header>
				<Card.Title>Profile</Card.Title>
				<Card.Description>
					Signed in as
					{$sessionQuery.data?.user?.name ?? $sessionQuery.data?.user?.email}
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-2 text-sm">
				<p class="text-muted-foreground">
					Server status: {$privateDataQuery.data?.message ?? "Loading..."}
				</p>
				<p class="text-muted-foreground">
					Email: {$sessionQuery.data?.user?.email}
				</p>
			</Card.Content>
			<Card.Footer class="flex gap-2">
				<Button href={resolve("/dashboard/settings")} variant="outline">
					Account Settings
				</Button>
				<Button href={resolve("/org/team")} variant="outline">Team</Button>
			</Card.Footer>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Recurring Reminder</Card.Title>
				<Card.Description>
					Schedules queue-backed recurring notifications for your user.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<div class="space-y-2">
					<Label for="reminder-title">Title</Label>
					<Input id="reminder-title" bind:value={reminderTitle} />
				</div>
				<div class="space-y-2">
					<Label for="reminder-body">Body</Label>
					<Input id="reminder-body" bind:value={reminderBody} />
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="reminder-interval">Interval (seconds)</Label>
						<Input
							id="reminder-interval"
							bind:value={reminderIntervalSeconds}
						/>
					</div>
					<div class="space-y-2">
						<Label for="reminder-runs">Runs</Label>
						<Input id="reminder-runs" bind:value={reminderRunCount} />
					</div>
				</div>
				{#if reminderMessage}
					<p class="text-sm text-primary">{reminderMessage}</p>
				{/if}
				{#if reminderError}
					<p class="text-sm text-destructive">{reminderError}</p>
				{/if}
			</Card.Content>
			<Card.Footer>
				<Button
					onclick={() => void submitRecurringReminder()}
					disabled={$scheduleReminderMutation.isPending}
				>
					{$scheduleReminderMutation.isPending ? "Scheduling..." : "Schedule Reminder"}
				</Button>
			</Card.Footer>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Mock Payment Notification</Card.Title>
				<Card.Description>
					Creates a payment success notification event for testing SaaS flows.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="charge-amount">Amount (cents)</Label>
						<Input id="charge-amount" bind:value={chargeAmountCents} />
					</div>
					<div class="space-y-2">
						<Label for="charge-description">Description</Label>
						<Input id="charge-description" bind:value={chargeDescription} />
					</div>
				</div>
				{#if chargeMessage}
					<p class="text-sm text-primary">{chargeMessage}</p>
				{/if}
				{#if chargeError}
					<p class="text-sm text-destructive">{chargeError}</p>
				{/if}
			</Card.Content>
			<Card.Footer class="flex gap-2">
				<Button
					onclick={() => void submitMockCharge()}
					disabled={$mockChargeMutation.isPending}
				>
					{$mockChargeMutation.isPending ? "Submitting..." : "Create Mock Charge"}
				</Button>
				<Button href={resolve("/todos")} variant="outline">Open Todos</Button>
				<Button href={resolve("/chat")} variant="outline">
					Open Assistant
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>
{/if}
