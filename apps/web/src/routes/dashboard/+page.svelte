<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import * as Card from "@full-stack-cf-app/ui/components/card";
	import { createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { authClient } from "$lib/auth-client";
	import { orpc } from "$lib/orpc";

	let customerState = $state<{ activeSubscriptions?: unknown[] } | null>(null);

	const sessionQuery = authClient.useSession();

	const privateDataQuery = createQuery(orpc.privateData.queryOptions());

	$effect(() => {
		if (!($sessionQuery.isPending || $sessionQuery.data)) {
			goto("/login");
		}
	});

	$effect(() => {
		if ($sessionQuery.data) {
			authClient.customer.state().then(({ data }) => {
				customerState = data;
			});
		}
	});

	const hasPro = $derived(
		(customerState?.activeSubscriptions?.length ?? 0) > 0
	);
</script>

{#if $sessionQuery.isPending}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if !$sessionQuery.data}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Redirecting to login...</p>
	</div>
{:else}
	<div class="max-w-2xl mx-auto p-6 space-y-6">
		<h1 class="text-3xl font-bold">Dashboard</h1>

		<Card.Root>
			<Card.Header>
				<Card.Title>Welcome, {$sessionQuery.data.user.name}</Card.Title>
				<Card.Description>Your account overview</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">API Status</span>
					<span class="text-foreground">
						{$privateDataQuery.data?.message ?? "Loading..."}
					</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Plan</span>
					<span
						class={hasPro ? "text-primary font-semibold" : "text-foreground"}
					>
						{hasPro ? "Pro" : "Free"}
					</span>
				</div>
			</Card.Content>
			<Card.Footer>
				{#if hasPro}
					<Button
						variant="outline"
						onclick={async () => await authClient.customer.portal()}
					>
						Manage Subscription
					</Button>
				{:else}
					<Button
						onclick={async () => await authClient.checkout({ slug: "pro" })}
					>
						Upgrade to Pro
					</Button>
				{/if}
			</Card.Footer>
		</Card.Root>
	</div>
{/if}
