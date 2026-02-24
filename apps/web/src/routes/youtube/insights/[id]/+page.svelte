<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import * as Collapsible from "@my-app/ui/components/collapsible";
	import { Separator } from "@my-app/ui/components/separator";
	import { createQuery } from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { resolve } from "$app/paths";
	import { page } from "$app/stores";
	import { orpc } from "$lib/orpc";

	const clusterId = $derived($page.params.id);

	// ─── Cluster data (from list filtered by id) ─────────────────────────────
	// We re-use the list endpoint with a search filter to get our cluster.
	// A dedicated get-by-id endpoint would be better, but this works.

	const clustersQuery = createQuery(
		derived(page, () =>
			orpc.youtube.clusters.list.queryOptions({
				input: { search: undefined, limit: 100, offset: 0 },
			})
		)
	);

	const cluster = $derived(
		($clustersQuery.data ?? []).find((c: { id: string }) => c.id === clusterId)
	);

	// ─── Signals for this cluster ────────────────────────────────────────────

	const signalsQuery = createQuery(
		derived(page, ($p) =>
			orpc.youtube.signals.list.queryOptions({
				input: {
					clusterId: $p.params.id,
					limit: 100,
					offset: 0,
				},
			})
		)
	);

	// ─── Expanded signal state ───────────────────────────────────────────────

	let expandedSignalId = $state<string | null>(null);

	const toggleSignal = (id: string) => {
		expandedSignalId = expandedSignalId === id ? null : id;
	};

	// ─── Helpers ─────────────────────────────────────────────────────────────

	const severityColor = (severity: string) => {
		switch (severity) {
			case "critical":
				return "destructive" as const;
			case "high":
				return "destructive" as const;
			case "medium":
				return "default" as const;
			case "low":
				return "secondary" as const;
			case "info":
				return "outline" as const;
			default:
				return "secondary" as const;
		}
	};

	const scoreToSeverityLabel = (score: number | null): string => {
		if (score === null) return "?";
		if (score >= 10) return "critical";
		if (score >= 8) return "high";
		if (score >= 4) return "medium";
		if (score >= 2) return "low";
		return "info";
	};

	const stateColor = (state: string) => {
		switch (state) {
			case "open":
				return "destructive" as const;
			case "acknowledged":
				return "default" as const;
			case "in_progress":
				return "default" as const;
			case "fixed":
				return "secondary" as const;
			case "ignored":
				return "outline" as const;
			case "regression":
				return "destructive" as const;
			default:
				return "secondary" as const;
		}
	};

	const formatTimestamp = (seconds: number | null) => {
		if (seconds === null || seconds === undefined) return null;
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const youtubeEmbedUrl = (videoId: string, startSeconds?: number | null) => {
		let url = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
		if (startSeconds) {
			url += `?start=${startSeconds}`;
		}
		return url;
	};

	// Fetch videos to resolve internal videoId → youtubeVideoId
	const videosQuery = createQuery(
		orpc.youtube.videos.list.queryOptions({
			input: { limit: 100, offset: 0 },
		})
	);

	const videoMap = $derived(
		new Map(
			($videosQuery.data ?? []).map(
				(v: { id: string; youtubeVideoId: string }) => [v.id, v.youtubeVideoId]
			)
		)
	);

	const getYoutubeVideoId = (internalId: string) =>
		videoMap.get(internalId) ?? null;
</script>

<div class="space-y-6">
	<!-- ─── Breadcrumb + Back ──────────────────────────────────────────────── -->

	<div class="flex items-center gap-2 text-sm text-muted-foreground">
		<a href={resolve("/youtube")} class="hover:text-foreground">YouTube</a>
		<span>/</span>
		<a href={resolve("/youtube/insights")} class="hover:text-foreground"
			>Insights</a
		>
		<span>/</span>
		<span class="text-foreground">{cluster?.title ?? "..."}</span>
	</div>

	<!-- ─── Cluster Header ─────────────────────────────────────────────────── -->

	{#if $clustersQuery.isPending}
		<p class="text-sm text-muted-foreground">Loading cluster...</p>
	{:else if !cluster}
		<p class="text-sm text-destructive">Cluster not found.</p>
	{:else}
		<div>
			<h2 class="text-2xl font-bold">{cluster.title}</h2>
			{#if cluster.summary}
				<p class="mt-2 text-muted-foreground">{cluster.summary}</p>
			{/if}
			<div class="mt-3 flex flex-wrap items-center gap-2">
				<Badge variant={stateColor(cluster.state)}>
					{cluster.state.replace(/_/g, " ")}
				</Badge>
				{#if cluster.type}
					<Badge variant="outline">{cluster.type.replace(/_/g, " ")}</Badge>
				{/if}
				{#if cluster.severity}
					<Badge variant={severityColor(cluster.severity)}
						>{cluster.severity}</Badge
					>
				{/if}
				{#if cluster.component}
					<Badge variant="secondary">{cluster.component}</Badge>
				{/if}
			</div>
			<div class="mt-3 flex gap-6 text-sm text-muted-foreground">
				<span><strong>{cluster.signalCount}</strong> signals</span>
				<span><strong>{cluster.uniqueAuthors}</strong> unique authors</span>
				<span>Impact: <strong>{cluster.impactScore}</strong></span>
				{#if cluster.firstSeenVersion}
					<span>First seen: <strong>v{cluster.firstSeenVersion}</strong></span>
				{/if}
				{#if cluster.fixedInVersion}
					<span>Fixed in: <strong>v{cluster.fixedInVersion}</strong></span>
				{/if}
			</div>
			{#if cluster.externalIssueUrl}
				<div class="mt-2">
					<a
						href={cluster.externalIssueUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="text-sm text-primary hover:underline"
					>
						{cluster.externalIssueId ?? cluster.externalIssueUrl}
					</a>
				</div>
			{/if}
		</div>

		<Separator />

		<!-- ─── Signals List ───────────────────────────────────────────────── -->

		<div>
			<h3 class="mb-4 text-lg font-semibold">
				Signals ({($signalsQuery.data ?? []).length})
			</h3>

			{#if $signalsQuery.isPending}
				<p class="text-sm text-muted-foreground">Loading signals...</p>
			{:else if ($signalsQuery.data ?? []).length === 0}
				<p class="text-sm text-muted-foreground">
					No signals in this cluster yet.
				</p>
			{:else}
				<div class="space-y-3">
					{#each $signalsQuery.data ?? [] as signal (signal.id)}
						<Card.Root
							class="cursor-pointer transition {expandedSignalId === signal.id ? 'ring-2 ring-primary' : 'hover:shadow-sm'}"
						>
							<!-- Signal Summary Row -->
							<button
								type="button"
								class="w-full p-4 text-left"
								onclick={() => toggleSignal(signal.id)}
							>
								<div class="flex items-start justify-between gap-4">
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium leading-relaxed">
											"{signal.text}"
										</p>
										<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
											<Badge
												variant={severityColor(scoreToSeverityLabel(signal.severityScore))}
												class="text-xs"
											>
												{scoreToSeverityLabel(signal.severityScore)}
												({signal.severityScore ?? "?"})
											</Badge>
											<Badge variant="outline" class="text-xs">
												{signal.type.replace(/_/g, " ")}
											</Badge>
											{#if signal.component}
												<span class="text-muted-foreground"
													>{signal.component}</span
												>
											{/if}
											{#if signal.confidence}
												<span class="text-muted-foreground"
													>{signal.confidence}% confidence</span
												>
											{/if}
											{#if signal.timestampStart !== null}
												<span class="text-muted-foreground">
													@ {formatTimestamp(signal.timestampStart)}
												</span>
											{/if}
										</div>
									</div>
									<span class="text-xs text-muted-foreground shrink-0">
										{expandedSignalId === signal.id ? "▲" : "▼"}
									</span>
								</div>
							</button>

							<!-- Expanded Detail -->
							{#if expandedSignalId === signal.id}
								<div class="border-t px-4 pb-4 pt-3 space-y-4">
									<!-- Context -->
									<div class="rounded-md bg-muted/50 p-3 text-sm">
										{#if signal.contextBefore}
											<span class="text-muted-foreground"
												>{signal.contextBefore}
											</span>
										{/if}
										<mark class="rounded bg-primary/20 px-0.5 font-medium">
											{signal.text}
										</mark>
										{#if signal.contextAfter}
											<span class="text-muted-foreground">
												{signal.contextAfter}</span
											>
										{/if}
									</div>

									<!-- Metadata -->
									<div
										class="flex flex-wrap gap-4 text-xs text-muted-foreground"
									>
										{#if signal.gameVersion}
											<span>Version: {signal.gameVersion}</span>
										{/if}
										<span
											>Created:
											{new Date(signal.createdAt).toLocaleDateString()}</span
										>
										<a
											href={resolve(`/youtube/videos/${signal.videoId}`)}
											class="text-primary hover:underline"
										>
											View Video →
										</a>
									</div>

									<!-- Embedded YouTube Player at timestamp -->
									{#if signal.videoId}
										{@const ytVideoId = getYoutubeVideoId(signal.videoId)}
										{#if ytVideoId}
											<div
												class="aspect-video w-full max-w-lg overflow-hidden rounded-lg"
											>
												<iframe
													src={youtubeEmbedUrl(ytVideoId, signal.timestampStart)}
													title="YouTube video"
													class="h-full w-full"
													allowfullscreen
													loading="lazy"
													sandbox="allow-scripts allow-same-origin allow-presentation"
												></iframe>
											</div>
										{/if}
									{/if}
								</div>
							{/if}
						</Card.Root>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
