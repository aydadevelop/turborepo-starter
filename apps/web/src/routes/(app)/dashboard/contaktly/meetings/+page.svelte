<script lang="ts">
	import { DEMO_WIDGET_CONFIG_ID } from "@my-app/contaktly-widget";
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { createQuery } from "@tanstack/svelte-query";
	import { resolve } from "$app/paths";
	import { orpc } from "$lib/orpc";

	const meetingsQuery = createQuery(() =>
		orpc.contaktly.getMeetingPipeline.queryOptions({
			input: { configId: DEMO_WIDGET_CONFIG_ID },
		})
	);
	const pipeline = $derived(meetingsQuery.data);

	const formatUpdatedAt = (value: string) =>
		new Date(value).toLocaleString(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		});
	const slotEntries = (slots: Record<string, string>) =>
		Object.entries(slots).filter(([, value]) => value.trim().length > 0);
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
	<div class="space-y-2" data-testid="contaktly-meetings-heading">
		<p class="text-sm uppercase tracking-[0.3em] text-primary">Meetings</p>
		<h1 class="text-3xl font-semibold tracking-tight">Booking handoff</h1>
		<p class="max-w-3xl text-muted-foreground">
			This view shows the current MVP meeting path: one workspace booking
			target, one connected Google calendar binding, and the live queue of leads
			already ready to book.
		</p>
	</div>

	<div class="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
		<div class="grid gap-5">
			<Card.Root>
				<Card.Header>
					<Card.Title>Booking setup</Card.Title>
					<Card.Description>
						Current public booking target for the widget CTA
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-3 text-sm text-muted-foreground">
					<p data-testid="contaktly-meetings-booking-url">
						<strong>booking URL:</strong>
						<span class="font-mono"
							>{pipeline?.bookingUrl ?? "Loading..."}</span
						>
					</p>
					<p>
						<strong>calendar status:</strong>
						<span class="font-mono">
							{pipeline?.calendar.status ?? "Loading"}
						</span>
					</p>
					<p>
						<strong>account:</strong>
						<span class="font-mono">
							{pipeline?.calendar.accountEmail ?? "Not linked"}
						</span>
					</p>
					<p>
						<strong>calendar:</strong>
						<span class="font-mono">
							{pipeline?.calendar.calendarId ?? "Not connected"}
						</span>
					</p>
				</Card.Content>
				<Card.Footer>
					<Button href={resolve("/dashboard/contaktly/widget")}>
						Open booking setup
					</Button>
				</Card.Footer>
			</Card.Root>

			<Card.Root>
				<Card.Header> <Card.Title>Current limit</Card.Title> </Card.Header>
				<Card.Content class="text-sm text-muted-foreground">
					The widget still hands off to a booking target after qualification.
					Inline meeting scheduling is a later slice, so this queue stays the
					honest operator view for the current MVP.
				</Card.Content>
			</Card.Root>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Ready-to-book queue</Card.Title>
				<Card.Description>
					Leads that already reached the meeting CTA
				</Card.Description>
			</Card.Header>
			<Card.Content
				class="space-y-4"
				data-testid="contaktly-meetings-ready-queue"
			>
				{#if !pipeline || pipeline.readyToBookConversations.length === 0}
					<p class="text-sm text-muted-foreground">
						No booking-ready leads yet.
					</p>
				{:else}
					{#each pipeline.readyToBookConversations as conversation}
						<div class="rounded-2xl border border-border/70 bg-card/40 p-4">
							<div class="flex items-start justify-between gap-3">
								<div>
									<p class="font-medium">{conversation.visitorId}</p>
									<p class="text-xs text-muted-foreground">
										Updated {formatUpdatedAt(conversation.updatedAt)}
									</p>
								</div>
								<Badge>{conversation.lastIntent}</Badge>
							</div>
							<p class="mt-3 text-sm text-muted-foreground">
								{conversation.lastMessageText ?? "Book now"}
							</p>
							<div class="mt-3 space-y-1 text-sm text-muted-foreground">
								{#each slotEntries(conversation.slots) as [ key, value ]}
									<p><strong>{key}:</strong> {value}</p>
								{/each}
							</div>
						</div>
					{/each}
				{/if}
			</Card.Content>
			<Card.Footer>
				<Button href={resolve("/dashboard/contaktly/conversations")}>
					Open full inbox
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>
</div>
