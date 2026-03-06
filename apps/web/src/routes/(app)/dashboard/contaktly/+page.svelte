<script lang="ts">
	import { DEMO_WIDGET_CONFIG_ID } from "@my-app/contaktly-widget";
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { createQuery } from "@tanstack/svelte-query";
	import { resolve } from "$app/paths";
	import { orpc } from "$lib/orpc";

	type Stage = "POC" | "MVP";

	type SliceRow = {
		actor: string;
		e2e: string;
		stage: Stage;
		status: "completed" | "in_progress" | "planned";
		title: string;
		want: string;
	};

	const statusVariant = {
		completed: "default",
		in_progress: "secondary",
		planned: "outline",
	} as const;

	const stageVariant = {
		POC: "secondary",
		MVP: "outline",
	} as const;
	const analyticsQuery = createQuery(() =>
		orpc.contaktly.getAnalyticsSummary.queryOptions({
			input: { configId: DEMO_WIDGET_CONFIG_ID },
		})
	);
	const analytics = $derived(analyticsQuery.data);

	const slices: SliceRow[] = [
		{
			actor: "Visitor",
			stage: "POC",
			status: "completed",
			title: "Widget loader + resume",
			want: "open the widget, answer qualification prompts, and keep history after reload",
			e2e: "Green on /widget host and Astro embed reload flow",
		},
		{
			actor: "Workspace admin",
			stage: "POC",
			status: "completed",
			title: "Config overview + snippet generation",
			want: "see public config, understand embed model, and copy the real snippet",
			e2e: "Admin route should show config id, snippet, stage plan, and next slices",
		},
		{
			actor: "Workspace admin",
			stage: "POC",
			status: "completed",
			title: "Calendar URL fallback",
			want: "paste a booking URL without OAuth",
			e2e: "Qualified widget visitor reaches CTA pointing at configured URL",
		},
		{
			actor: "Workspace admin",
			stage: "MVP",
			status: "completed",
			title: "Google OAuth calendar access",
			want: "link Google and persist one workspace calendar connection",
			e2e: "Admin sees linked Google account, connects it, and status survives reload",
		},
		{
			actor: "Workspace admin",
			stage: "POC",
			status: "completed",
			title: "Astro scrape prefill",
			want: "paste a site URL and get draft starter cards plus instructions",
			e2e: "Astro fixture URL returns a draft config preview",
		},
		{
			actor: "Sales operator",
			stage: "MVP",
			status: "completed",
			title: "Conversation inbox",
			want: "inspect real conversations, qualification state, and the live thread inside the active organization",
			e2e: "Admin opens /conversations, sorts threads, and inspects the seeded widget transcript",
		},
	];

	const formatAverageDepth = (value: number | undefined) =>
		(value ?? 0).toFixed(1);
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
	<div class="space-y-3" data-testid="contaktly-overview-heading">
		<p class="text-sm uppercase tracking-[0.3em] text-primary">Contaktly</p>
		<h1 class="text-3xl font-semibold tracking-tight">Contaktly overview</h1>
		<p class="max-w-4xl text-muted-foreground">
			This screen combines live demo metrics with the current delivery plan. It
			is the first stop before drilling into conversations, booking setup, and
			knowledge.
		</p>
	</div>

	<div
		class="grid gap-4 md:grid-cols-4"
		data-testid="contaktly-overview-live-summary"
	>
		<Card.Root>
			<Card.Header class="space-y-1">
				<Card.Description>Chat Sessions</Card.Description>
				<Card.Title
					class="text-3xl"
					data-testid="contaktly-overview-total-conversations"
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
					data-testid="contaktly-overview-ready-to-book"
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
					data-testid="contaktly-overview-qualified-rate"
				>
					{analytics?.qualificationRate ?? 0}%
				</Card.Title>
			</Card.Header>
		</Card.Root>

		<Card.Root>
			<Card.Header class="space-y-1">
				<Card.Description>Avg Thread Depth</Card.Description>
				<Card.Title class="text-3xl" data-testid="contaktly-overview-avg-depth">
					{formatAverageDepth(analytics?.averageMessagesPerConversation)}
				</Card.Title>
			</Card.Header>
		</Card.Root>
	</div>

	<div class="grid gap-5 md:grid-cols-3">
		<Card.Root data-testid="contaktly-overview-config-card">
			<Card.Header>
				<Card.Title>Public Config</Card.Title>
				<Card.Description>Current seeded widget identifier</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm">
				<p>
					<strong>config id:</strong>
					<span class="font-mono">{DEMO_WIDGET_CONFIG_ID}</span>
				</p>
				<p>
					<strong>current state:</strong>
					public widget and Astro embed resume the same server-backed
					conversation.
				</p>
			</Card.Content>
			<Card.Footer>
				<Button href={resolve("/dashboard/contaktly/widget")}>
					Open widget delivery details
				</Button>
			</Card.Footer>
		</Card.Root>

		<Card.Root data-testid="contaktly-overview-calendar-card">
			<Card.Header>
				<Card.Title>Calendar Split</Card.Title>
				<Card.Description>POC first, OAuth second</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm">
				<p data-testid="contaktly-calendar-poc">
					<strong>POC:</strong>
					client pastes a booking URL and the widget CTA opens it after
					qualification.
				</p>
				<p data-testid="contaktly-calendar-mvp">
					<strong>MVP:</strong>
					client signs in with Google OAuth and grants calendar access for
					native booking.
				</p>
			</Card.Content>
		</Card.Root>

		<Card.Root data-testid="contaktly-overview-next-card">
			<Card.Header>
				<Card.Title>Operator Workflow</Card.Title>
				<Card.Description
					>Use the same admin shell for setup and inbox</Card.Description
				>
			</Card.Header>
			<Card.Content class="space-y-2 text-sm text-muted-foreground">
				<p>1. Widget and prefill stay in setup</p>
				<p>2. Live customer threads land in the conversations inbox</p>
				<p>3. Booking queue and analytics stay visible from the same shell</p>
			</Card.Content>
			<Card.Footer>
				<Button href={resolve("/dashboard/contaktly/analytics")}>
					Open analytics
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>

	<Card.Root data-testid="contaktly-stage-matrix">
		<Card.Header>
			<Card.Title>Actor / Stage Matrix</Card.Title>
			<Card.Description>
				Each slice is defined by who wants what, at which maturity, and how we
				prove it end to end.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4">
			{#each slices as slice}
				<div
					class="rounded-2xl border border-border/70 bg-card/40 p-4"
					data-testid={`contaktly-slice-${slice.title
						.toLowerCase()
						.replaceAll(/[^a-z0-9]+/g, "-")
						.replace(/^-|-$/g, "")}`}
				>
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant={stageVariant[slice.stage]}>{slice.stage}</Badge>
						<Badge variant={statusVariant[slice.status]}>{slice.status}</Badge>
						<span
							class="text-xs uppercase tracking-[0.2em] text-muted-foreground"
						>
							{slice.actor}
						</span>
					</div>
					<h2 class="mt-3 text-lg font-semibold">{slice.title}</h2>
					<p class="mt-2 text-sm text-muted-foreground">
						<strong>Want:</strong> {slice.want}
					</p>
					<p class="mt-2 text-sm text-muted-foreground">
						<strong>E2E:</strong> {slice.e2e}
					</p>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
</div>
