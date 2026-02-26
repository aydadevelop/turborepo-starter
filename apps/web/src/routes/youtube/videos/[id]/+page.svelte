<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import * as Collapsible from "@my-app/ui/components/collapsible";
	import { Separator } from "@my-app/ui/components/separator";
	import * as Tabs from "@my-app/ui/components/tabs";
	import {
		createMutation,
		createQuery,
		useQueryClient,
	} from "@tanstack/svelte-query";
	import { tick } from "svelte";
	import { derived, toStore } from "svelte/store";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { orpc } from "$lib/orpc";

	const videoId = $derived(page.params.id);

	// Bridge Svelte 5 reactive state → store for TanStack Query compatibility
	const videoIdStore = toStore(() => page.params.id);

	// ─── Video data ──────────────────────────────────────────────────────────

	const videosQuery = createQuery(
		orpc.youtube.videos.list.queryOptions({
			input: { limit: 100, offset: 0 },
		})
	);

	const video = $derived(
		($videosQuery.data ?? []).find((v: { id: string }) => v.id === videoId)
	);

	// ─── Signals for this video ──────────────────────────────────────────────

	const signalsQuery = createQuery(
		derived(videoIdStore, ($vid) =>
			orpc.youtube.signals.list.queryOptions({
				input: { videoId: $vid ?? "", limit: 100, offset: 0 },
			})
		)
	);

	// ─── Transcript captions ─────────────────────────────────────────────────

	const transcriptQuery = createQuery(
		derived(videoIdStore, ($vid) =>
			$vid
				? orpc.youtube.transcripts.get.queryOptions({
						input: { videoId: $vid },
					})
				: {
						enabled: false as const,
						queryKey: ["youtube", "transcripts", "none"] as const,
						queryFn: () => null,
					}
		)
	);

	type TimedSegment = { start: number; end: number; text: string };
	type Signal = NonNullable<typeof $signalsQuery.data>[number];

	const segments = $derived(
		($transcriptQuery.data?.timedSegments ?? []) as TimedSegment[]
	);

	// ─── Signal ↔ Segment linking ────────────────────────────────────────────

	/** Build a map from segment index → signals that overlap it */
	const segmentSignalMap = $derived.by(() => {
		const signals = $signalsQuery.data ?? [];
		const map = new Map<number, Signal[]>();
		for (const signal of signals) {
			if (signal.timestampStart === null) continue;
			const start = signal.timestampStart;
			const end = signal.timestampEnd ?? start + 5;
			for (let i = 0; i < segments.length; i++) {
				const seg = segments[i];
				// Overlap check: segment range intersects signal range
				if (seg.end >= start && seg.start <= end) {
					const existing = map.get(i) ?? [];
					existing.push(signal);
					map.set(i, existing);
				}
			}
		}
		return map;
	});

	/** Find the first segment index that overlaps a signal */
	function findSegmentForSignal(signal: Signal): number {
		if (signal.timestampStart === null) return -1;
		const start = signal.timestampStart;
		const end = signal.timestampEnd ?? start + 5;
		for (let i = 0; i < segments.length; i++) {
			if (segments[i].end >= start && segments[i].start <= end) return i;
		}
		return -1;
	}

	// ─── Expanded / active state ─────────────────────────────────────────────

	let expandedSignalId = $state<string | null>(null);
	let highlightedSegmentIdx = $state<number | null>(null);
	let activeView = $state<"split" | "transcript" | "signals">("split");

	const toggleSignal = async (id: string) => {
		if (expandedSignalId === id) {
			expandedSignalId = null;
			highlightedSegmentIdx = null;
			return;
		}
		expandedSignalId = id;
		const signal = ($signalsQuery.data ?? []).find((s) => s.id === id);
		if (signal) {
			const idx = findSegmentForSignal(signal);
			highlightedSegmentIdx = idx;
			if (idx >= 0) {
				await tick();
				document.getElementById(`seg-${idx}`)?.scrollIntoView({
					behavior: "smooth",
					block: "center",
				});
			}
		}
	};

	const scrollToSignal = async (signalId: string) => {
		expandedSignalId = signalId;
		await tick();
		document.getElementById(`signal-${signalId}`)?.scrollIntoView({
			behavior: "smooth",
			block: "center",
		});
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

	const signalTypeColor = (type: string): string => {
		switch (type) {
			case "bug":
				return "bg-red-500/15 text-red-700 dark:text-red-400";
			case "crash":
				return "bg-red-600/20 text-red-800 dark:text-red-300";
			case "performance":
				return "bg-orange-500/15 text-orange-700 dark:text-orange-400";
			case "confusion":
				return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
			case "ux_friction":
				return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
			case "suggestion":
				return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
			case "praise":
				return "bg-green-500/15 text-green-700 dark:text-green-400";
			case "exploit":
				return "bg-purple-500/15 text-purple-700 dark:text-purple-400";
			default:
				return "bg-muted text-muted-foreground";
		}
	};

	const videoStatusColor = (status: string) => {
		switch (status) {
			case "ingested":
				return "default" as const;
			case "approved":
				return "default" as const;
			case "candidate":
				return "secondary" as const;
			case "rejected":
				return "destructive" as const;
			case "failed":
				return "destructive" as const;
			default:
				return "outline" as const;
		}
	};

	const formatTimestamp = (seconds: number | null) => {
		if (seconds === null || seconds === undefined) return null;
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const youtubeEmbedUrl = (ytId: string, startSeconds?: number | null) => {
		let url = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}`;
		if (startSeconds) {
			url += `?start=${Math.floor(startSeconds)}`;
		}
		return url;
	};

	// ─── Retry ingest ─────────────────────────────────────────────────────────

	const queryClient = useQueryClient();
	let retryError = $state<string | null>(null);

	const retryMutation = createMutation({
		mutationFn: (vid: string) =>
			orpc.youtube.videos.retryIngest.call({ videoId: vid }),
		onSuccess: () => {
			retryError = null;
			queryClient.invalidateQueries({ queryKey: ["youtube", "videos"] });
		},
		onError: (err: unknown) => {
			retryError = (err as { message?: string }).message ?? "Retry failed";
		},
	});

	// ─── Retrigger NLP ────────────────────────────────────────────────────────

	let retriggerError = $state<string | null>(null);
	let retriggerSuccess = $state<string | null>(null);

	const retriggerMutation = createMutation({
		mutationFn: (vid: string) =>
			orpc.youtube.signals.retriggerNlp.call({ videoId: vid }),
		onSuccess: (data) => {
			retriggerError = null;
			retriggerSuccess = `Queued — ${data.deletedSignals} old signal(s) cleared.`;
			queryClient.invalidateQueries({ queryKey: ["youtube", "signals"] });
			queryClient.invalidateQueries({ queryKey: ["youtube", "transcripts"] });
		},
		onError: (err: unknown) => {
			retriggerError =
				(err as { message?: string }).message ?? "Retrigger failed";
			retriggerSuccess = null;
		},
	});
</script>

<div class="space-y-4">
	<!-- ─── Breadcrumb ─────────────────────────────────────────────────────── -->

	<div class="flex items-center gap-2 text-sm text-muted-foreground">
		<a href={resolve("/youtube/videos")} class="hover:text-foreground"
			>Videos</a
		>
		<span>/</span>
		<span class="text-foreground">{video?.title ?? "Video"}</span>
	</div>

	{#if $videosQuery.isPending}
		<p class="text-sm text-muted-foreground">Loading video...</p>
	{:else if !video}
		<p class="text-sm text-destructive">Video not found.</p>
	{:else}
		<!-- ─── Video Header ───────────────────────────────────────────────── -->

		<div class="grid gap-6 lg:grid-cols-[1fr_400px]">
			<div>
				<h2 class="text-2xl font-bold">{video.title}</h2>
				<div
					class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
				>
					{#if video.uploaderChannelName}
						<span title={video.uploaderChannelName}
							>{video.uploaderChannelName}</span
						>
						<span>·</span>
					{/if}
					{#if video.publishedAt}
						<span>{video.publishedAt}</span>
						<span>·</span>
					{/if}
					{#if video.viewCount !== null}
						<span>{video.viewCount.toLocaleString()} views</span>
						<span>·</span>
					{/if}
					{#if video.duration}
						<span>{video.duration}</span>
					{/if}
				</div>
				<div class="mt-2 flex items-center gap-2">
					<Badge variant={videoStatusColor(video.status)}>{video.status}</Badge>
					{#if video.captionsAvailable}
						<Badge
							variant="secondary"
							class="text-xs"
							title="Manual captions available"
							>CC</Badge
						>
					{/if}
					{#if video.autoCaptionsAvailable}
						<Badge
							variant="outline"
							class="text-xs"
							title="Auto-generated captions available"
							>AUTO</Badge
						>
					{/if}
					{#if video.audioR2Key}
						<Badge
							variant="outline"
							class="text-xs"
							title="Audio stored: {video.audioR2Key}"
							>AUDIO</Badge
						>
					{/if}
					{#if video.captionsAvailable === false && video.autoCaptionsAvailable === false}
						<Badge variant="outline" class="text-xs text-muted-foreground"
							>no captions</Badge
						>
					{/if}
					{#if video.tags}
						{#each video.tags.slice(0, 5) as tag}
							<Badge variant="outline" class="text-xs">{tag}</Badge>
						{/each}
					{/if}
				</div>
				{#if video.status === "failed"}
					<div class="mt-3 flex flex-col gap-2">
						{#if (video as { failureReason?: string | null }).failureReason}
							<p class="text-sm text-destructive">
								<span class="font-medium">Failure:</span>
								{(video as { failureReason?: string | null }).failureReason}
							</p>
						{/if}
						{#if retryError}
							<p class="text-sm text-destructive">{retryError}</p>
						{/if}
						<Button
							size="sm"
							variant="outline"
							disabled={$retryMutation.isPending}
							onclick={() => void $retryMutation.mutate(videoId ?? "")}
						>
							{$retryMutation.isPending ? "Retrying..." : "↻ Retry ingestion"}
						</Button>
					</div>
				{/if}
				{#if video.description}
					<p class="mt-3 text-sm text-muted-foreground line-clamp-3">
						{video.description}
					</p>
				{/if}
			</div>

			<!-- Embedded YouTube player -->
			<div class="aspect-video overflow-hidden rounded-lg">
				<iframe
					src={youtubeEmbedUrl(video.youtubeVideoId)}
					title={video.title}
					class="h-full w-full"
					allowfullscreen
					loading="lazy"
					sandbox="allow-scripts allow-same-origin allow-presentation"
				></iframe>
			</div>
		</div>

		<Separator />

		<!-- ─── Toolbar ────────────────────────────────────────────────────── -->

		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<h3 class="text-lg font-semibold">
					Signals ({($signalsQuery.data ?? []).length})
				</h3>
				{#if segments.length > 0}
					<span class="text-sm text-muted-foreground">
						· {segments.length} captions
					</span>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				<Tabs.Root bind:value={activeView}>
					<Tabs.List class="h-8">
						<Tabs.Trigger value="split" class="text-xs px-2 py-1"
							>Split</Tabs.Trigger
						>
						<Tabs.Trigger value="transcript" class="text-xs px-2 py-1"
							>Transcript</Tabs.Trigger
						>
						<Tabs.Trigger value="signals" class="text-xs px-2 py-1"
							>Signals</Tabs.Trigger
						>
					</Tabs.List>
				</Tabs.Root>

				<Button
					size="sm"
					variant="outline"
					disabled={$retriggerMutation.isPending}
					onclick={() => {
						retriggerSuccess = null;
						retriggerError = null;
						if (videoId) void $retriggerMutation.mutate(videoId);
					}}
				>
					{$retriggerMutation.isPending ? "Re-extracting..." : "↻ Re-extract signals"}
				</Button>
			</div>
		</div>
		{#if retriggerSuccess}
			<p class="text-xs text-muted-foreground">{retriggerSuccess}</p>
		{/if}
		{#if retriggerError}
			<p class="text-xs text-destructive">{retriggerError}</p>
		{/if}

		{#if $signalsQuery.isPending || $transcriptQuery.isPending}
			<p class="text-sm text-muted-foreground">Loading...</p>
		{:else}
			<!-- ─── Two-panel layout ───────────────────────────────────────── -->

			<div class="grid gap-4" class:lg:grid-cols-2={activeView === "split"}>
				<!-- ─── Transcript Panel ────────────────────────────────────── -->

				{#if activeView !== "signals"}
					<div class="space-y-1">
						<h4 class="text-sm font-medium text-muted-foreground mb-2">
							Transcript
						</h4>
						{#if segments.length === 0}
							<p class="text-sm text-muted-foreground">
								No captions available.
							</p>
						{:else}
							<div
								class="max-h-[70vh] overflow-y-auto rounded-md border p-3 space-y-0.5"
							>
								{#each segments as seg, i}
									{@const linkedSignals = segmentSignalMap.get(i)}
									{@const isHighlighted = highlightedSegmentIdx === i}
									{#if linkedSignals}
										<button
											type="button"
											id="seg-{i}"
											class="group flex gap-2 rounded px-1.5 py-0.5 text-sm transition-colors text-left w-full
												{isHighlighted ? 'bg-primary/15 ring-1 ring-primary/30' : ''}
												hover:bg-muted/60"
											onclick={() => void scrollToSignal(linkedSignals[0].id)}
										>
											<span
												class="shrink-0 w-12 text-right text-xs text-muted-foreground tabular-nums pt-0.5"
											>
												{formatTimestamp(seg.start)}
											</span>
											<span class="flex-1 font-medium">
												{seg.text}
												{#each linkedSignals as ls}
													<span
														class="ml-1 inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium {signalTypeColor(ls.type)}"
													>
														{ls.type.replace(/_/g, " ")}
													</span>
												{/each}
											</span>
										</button>
									{:else}
										<div
											id="seg-{i}"
											class="flex gap-2 rounded px-1.5 py-0.5 text-sm transition-colors
												{isHighlighted ? 'bg-primary/15 ring-1 ring-primary/30' : ''}"
										>
											<span
												class="shrink-0 w-12 text-right text-xs text-muted-foreground tabular-nums pt-0.5"
											>
												{formatTimestamp(seg.start)}
											</span>
											<span class="flex-1 text-muted-foreground">
												{seg.text}
											</span>
										</div>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- ─── Signals Panel ──────────────────────────────────────── -->

				{#if activeView !== "transcript"}
					<div class="space-y-1">
						<h4 class="text-sm font-medium text-muted-foreground mb-2">
							Extracted Signals
						</h4>
						{#if ($signalsQuery.data ?? []).length === 0}
							<Card.Root>
								<Card.Content class="py-8 text-center text-muted-foreground">
									No signals extracted from this video yet.
								</Card.Content>
							</Card.Root>
						{:else}
							<div class="max-h-[70vh] overflow-y-auto space-y-2 p-1">
								{#each $signalsQuery.data ?? [] as signal (signal.id)}
									<Collapsible.Root
										open={expandedSignalId === signal.id}
										onOpenChange={(open) => {
											if (open) {
												void toggleSignal(signal.id);
											} else {
												expandedSignalId = null;
												highlightedSegmentIdx = null;
											}
										}}
									>
										<Card.Root
											id="signal-{signal.id}"
											class="transition {expandedSignalId === signal.id ? 'ring-2 ring-primary' : 'hover:shadow-sm'}"
										>
											<Collapsible.Trigger class="w-full p-3 text-left">
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0 flex-1">
														<p class="text-sm font-medium leading-snug">
															"{signal.text}"
														</p>
														<div
															class="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs"
														>
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
																	>{signal.confidence}%</span
																>
															{/if}
															{#if signal.timestampStart !== null}
																<span class="text-muted-foreground">
																	@ {formatTimestamp(signal.timestampStart)}
																</span>
															{/if}
															{#if signal.clusterId}
																<a
																	href={resolve(`/youtube/insights/${signal.clusterId}`)}
																	class="text-primary hover:underline"
																	onclick={(e) => e.stopPropagation()}
																>
																	Cluster →
																</a>
															{/if}
														</div>
													</div>
													<span class="text-xs text-muted-foreground shrink-0">
														{expandedSignalId === signal.id ? "▲" : "▼"}
													</span>
												</div>
											</Collapsible.Trigger>

											<Collapsible.Content>
												{@const sigIdx = findSegmentForSignal(signal)}
												<div class="border-t px-3 pb-3 pt-2 space-y-3">
													<!-- Reasoning -->
													{#if signal.reasoning}
														<p class="text-xs text-muted-foreground italic">
															{signal.reasoning}
														</p>
													{/if}

													<!-- Transcript context from captions -->
													{#if sigIdx >= 0 && segments.length > 0}
														{@const ctxStart = Math.max(0, sigIdx - 2)}
														{@const ctxEnd = Math.min(segments.length - 1, sigIdx + 2)}
														<div
															class="rounded-md bg-muted/50 p-2.5 text-sm leading-relaxed space-y-0.5"
														>
															{#each { length: ctxEnd - ctxStart + 1 } as _, offset}
																{@const ci = ctxStart + offset}
																{@const seg = segments[ci]}
																{@const isMatch = segmentSignalMap.get(ci)?.some((s) => s.id === signal.id)}
																<div
																	class="flex gap-2 {isMatch ? '' : 'opacity-60'}"
																>
																	<span
																		class="shrink-0 w-10 text-right text-xs text-muted-foreground tabular-nums"
																	>
																		{formatTimestamp(seg.start)}
																	</span>
																	{#if isMatch}
																		<mark
																			class="flex-1 rounded bg-primary/20 px-0.5 font-medium"
																		>
																			{seg.text}
																		</mark>
																	{:else}
																		<span class="flex-1">{seg.text}</span>
																	{/if}
																</div>
															{/each}
														</div>
													{:else if signal.contextBefore || signal.contextAfter}
														<!-- Fallback to contextBefore/After when no timed segments -->
														<div
															class="rounded-md bg-muted/50 p-2.5 text-sm leading-relaxed"
														>
															{#if signal.contextBefore}
																<span class="text-muted-foreground"
																	>{signal.contextBefore}
																</span>
															{/if}
															<mark
																class="rounded bg-primary/20 px-0.5 font-medium"
															>
																{signal.text}
															</mark>
															{#if signal.contextAfter}
																<span class="text-muted-foreground">
																	{signal.contextAfter}</span
																>
															{/if}
														</div>
													{/if}

													<!-- Tags -->
													{#if signal.tags && signal.tags.length > 0}
														<div class="flex flex-wrap gap-1">
															{#each signal.tags as tag}
																<Badge variant="outline" class="text-[10px]"
																	>{tag}</Badge
																>
															{/each}
														</div>
													{/if}

													<!-- Jump to timestamp in player -->
													{#if signal.timestampStart !== null}
														<div
															class="aspect-video w-full max-w-sm overflow-hidden rounded-lg"
														>
															<iframe
																src={youtubeEmbedUrl(video.youtubeVideoId, signal.timestampStart)}
																title="Signal at {formatTimestamp(signal.timestampStart)}"
																class="h-full w-full"
																allowfullscreen
																loading="lazy"
																sandbox="allow-scripts allow-same-origin allow-presentation"
															></iframe>
														</div>
													{/if}

													<div
														class="flex flex-wrap gap-3 text-xs text-muted-foreground"
													>
														{#if signal.gameVersion}
															<span>Version: {signal.gameVersion}</span>
														{/if}
														<span>
															Extracted:
															{new Date(signal.createdAt).toLocaleDateString()}
														</span>
													</div>
												</div>
											</Collapsible.Content>
										</Card.Root>
									</Collapsible.Root>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
