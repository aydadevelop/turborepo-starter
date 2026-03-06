<script lang="ts">
	import { DEMO_WIDGET_CONFIG_ID } from "@my-app/contaktly-widget";
	import { Badge } from "@my-app/ui/components/badge";
	import * as Card from "@my-app/ui/components/card";
	import { createQuery } from "@tanstack/svelte-query";
	import { orpc } from "$lib/orpc";

	const analyticsQuery = createQuery(() =>
		orpc.contaktly.getAnalyticsSummary.queryOptions({
			input: { configId: DEMO_WIDGET_CONFIG_ID },
		})
	);
	const analytics = $derived(analyticsQuery.data);

	const formatAverageDepth = (value: number | undefined) =>
		(value ?? 0).toFixed(1);
	const formatUpdatedAt = (value: string | null | undefined) =>
		value
			? new Date(value).toLocaleString(undefined, {
					dateStyle: "medium",
					timeStyle: "short",
				})
			: "No conversation data yet";
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
	<div class="space-y-2" data-testid="contaktly-analytics-heading">
		<p class="text-sm uppercase tracking-[0.3em] text-primary">Analytics</p>
		<h1 class="text-3xl font-semibold tracking-tight">Live funnel summary</h1>
		<p class="max-w-3xl text-muted-foreground">
			These metrics are derived from the current Contaktly workspace state: live
			conversations, qualification progress, calendar setup, and prefill
			readiness.
		</p>
	</div>

	<div class="grid gap-4 md:grid-cols-4">
		<Card.Root>
			<Card.Header class="space-y-1">
				<Card.Description>Chat Sessions</Card.Description>
				<Card.Title
					class="text-3xl"
					data-testid="contaktly-analytics-total-conversations"
				>
					{analytics?.totalConversations ?? 0}
				</Card.Title>
			</Card.Header>
		</Card.Root>

		<Card.Root>
			<Card.Header class="space-y-1">
				<Card.Description>Booking-ready Leads</Card.Description>
				<Card.Title
					class="text-3xl"
					data-testid="contaktly-analytics-ready-to-book"
				>
					{analytics?.readyToBookConversations ?? 0}
				</Card.Title>
			</Card.Header>
		</Card.Root>

		<Card.Root>
			<Card.Header class="space-y-1">
				<Card.Description>Qualified Rate</Card.Description>
				<Card.Title
					class="text-3xl"
					data-testid="contaktly-analytics-qualified-rate"
				>
					{analytics?.qualificationRate ?? 0}%
				</Card.Title>
			</Card.Header>
		</Card.Root>

		<Card.Root>
			<Card.Header class="space-y-1">
				<Card.Description>Avg Thread Depth</Card.Description>
				<Card.Title
					class="text-3xl"
					data-testid="contaktly-analytics-avg-depth"
				>
					{formatAverageDepth(analytics?.averageMessagesPerConversation)}
				</Card.Title>
			</Card.Header>
		</Card.Root>
	</div>

	<div class="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
		<Card.Root>
			<Card.Header>
				<Card.Title>Recent conversations</Card.Title>
				<Card.Description>
					Last updated {formatUpdatedAt(analytics?.lastUpdatedAt)}
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#if !analytics || analytics.recentConversations.length === 0}
					<p class="text-sm text-muted-foreground">
						No active conversations for this workspace yet.
					</p>
				{:else}
					{#each analytics.recentConversations as conversation}
						<div class="rounded-2xl border border-border/70 bg-card/40 p-4">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="font-medium">{conversation.visitorId}</p>
									<p class="text-xs text-muted-foreground">
										{conversation.lastMessageText ?? "No messages yet"}
									</p>
								</div>
								<Badge
									variant={conversation.stage === "ready_to_book"
										? "default"
										: "secondary"}
								>
									{conversation.stage}
								</Badge>
							</div>
						</div>
					{/each}
				{/if}
			</Card.Content>
		</Card.Root>

		<div class="grid gap-5">
			<Card.Root>
				<Card.Header>
					<Card.Title>Intent mix</Card.Title>
					<Card.Description>Current conversation distribution</Card.Description>
				</Card.Header>
				<Card.Content
					class="space-y-3"
					data-testid="contaktly-analytics-intent-breakdown"
				>
					{#if !analytics || analytics.intentBreakdown.length === 0}
						<p class="text-sm text-muted-foreground">No intent data yet.</p>
					{:else}
						{#each analytics.intentBreakdown as intent}
							<div class="flex items-center justify-between gap-3">
								<span class="text-sm capitalize">{intent.intent}</span>
								<Badge variant="outline">{intent.count}</Badge>
							</div>
						{/each}
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Setup health</Card.Title>
					<Card.Description
						>Signals that affect conversion quality</Card.Description
					>
				</Card.Header>
				<Card.Content class="space-y-3 text-sm text-muted-foreground">
					<div class="flex items-center justify-between gap-3">
						<span>Google calendar</span>
						<Badge
							variant={analytics?.calendarConnected ? "default" : "outline"}
						>
							{analytics?.calendarConnected ? "Connected" : "Pending"}
						</Badge>
					</div>
					<div class="flex items-center justify-between gap-3">
						<span>Prefill source</span>
						<Badge variant={analytics?.hasPrefillDraft ? "default" : "outline"}>
							{analytics?.hasPrefillDraft ? "Ready" : "Missing"}
						</Badge>
					</div>
					<div class="flex items-center justify-between gap-3">
						<span>Total messages</span>
						<Badge variant="secondary">{analytics?.totalMessages ?? 0}</Badge>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
