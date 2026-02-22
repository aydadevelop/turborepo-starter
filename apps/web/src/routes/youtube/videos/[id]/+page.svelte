<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Separator } from "@my-app/ui/components/separator";
	import { createQuery } from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { resolve } from "$app/paths";
	import { page } from "$app/stores";
	import { orpc } from "$lib/orpc";

	const videoId = $derived($page.params.id);

	// ─── Video data ──────────────────────────────────────────────────────────

	const videosQuery = createQuery(
		derived(page, () =>
			orpc.youtube.videos.list.queryOptions({
				input: { limit: 100, offset: 0 },
			})
		)
	);

	const video = $derived(
		($videosQuery.data ?? []).find((v: { id: string }) => v.id === videoId)
	);

	// ─── Signals for this video ──────────────────────────────────────────────

	const signalsQuery = createQuery(
		derived(page, ($p) =>
			orpc.youtube.signals.list.queryOptions({
				input: {
					videoId: $p.params.id,
					limit: 100,
					offset: 0,
				},
			})
		)
	);

	// ─── Expanded signal ─────────────────────────────────────────────────────

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
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const youtubeEmbedUrl = (ytId: string, startSeconds?: number | null) => {
		let url = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}`;
		if (startSeconds) {
			url += `?start=${startSeconds}`;
		}
		return url;
	};

	// Group signals by type for summary
	const signalsByType = $derived(() => {
		const groups = new Map<string, number>();
		for (const s of ($signalsQuery.data ?? []) as { type: string }[]) {
			groups.set(s.type, (groups.get(s.type) ?? 0) + 1);
		}
		return [...groups.entries()].sort((a, b) => b[1] - a[1]);
	});
</script>

<div class="space-y-6">
	<!-- ─── Breadcrumb ─────────────────────────────────────────────────────── -->

	<div class="flex items-center gap-2 text-sm text-muted-foreground">
		<a href={resolve("/youtube")} class="hover:text-foreground">YouTube</a>
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
					{#if video.channelName}
						<span>{video.channelName}</span>
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
					{#if video.tags}
						{#each video.tags.slice(0, 5) as tag}
							<Badge variant="outline" class="text-xs">{tag}</Badge>
						{/each}
					{/if}
				</div>
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

		<!-- ─── Signal Summary ─────────────────────────────────────────────── -->

		<div class="flex items-center justify-between">
			<h3 class="text-lg font-semibold">
				Signals ({($signalsQuery.data ?? []).length})
			</h3>
		</div>

		{#if $signalsQuery.isPending}
			<p class="text-sm text-muted-foreground">Loading signals...</p>
		{:else if ($signalsQuery.data ?? []).length === 0}
			<Card.Root>
				<Card.Content class="py-8 text-center text-muted-foreground">
					No signals extracted from this video yet.
				</Card.Content>
			</Card.Root>
		{:else}
			<!-- ─── Signal Cards ───────────────────────────────────────────── -->

			<div class="space-y-3">
				{#each $signalsQuery.data ?? [] as signal (signal.id)}
					<Card.Root
						class="transition {expandedSignalId === signal.id ? 'ring-2 ring-primary' : 'hover:shadow-sm'}"
					>
						<button
							type="button"
							class="w-full p-4 text-left"
							onclick={() => toggleSignal(signal.id)}
						>
							<div class="flex items-start justify-between gap-4">
								<div class="min-w-0 flex-1">
									<p class="text-sm font-medium">"{signal.text}"</p>
									<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
										<Badge
											variant={severityColor(signal.severity)}
											class="text-xs"
										>
											{signal.severity}
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
											<span class="text-muted-foreground"
												>@ {formatTimestamp(signal.timestampStart)}</span
											>
										{/if}
										{#if signal.clusterId}
											<a
												href={resolve(`/youtube/insights/${signal.clusterId}`)}
												class="text-primary hover:underline"
											>
												View Cluster →
											</a>
										{/if}
									</div>
								</div>
								<span class="text-xs text-muted-foreground shrink-0">
									{expandedSignalId === signal.id ? "▲" : "▼"}
								</span>
							</div>
						</button>

						{#if expandedSignalId === signal.id}
							<div class="border-t px-4 pb-4 pt-3 space-y-4">
								<!-- Context with highlighted signal text -->
								<div class="rounded-md bg-muted/50 p-3 text-sm leading-relaxed">
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

								<!-- Jump to timestamp in player -->
								{#if signal.timestampStart !== null}
									<div
										class="aspect-video w-full max-w-md overflow-hidden rounded-lg"
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

								<div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
									{#if signal.gameVersion}
										<span>Version: {signal.gameVersion}</span>
									{/if}
									<span
										>Extracted:
										{new Date(signal.createdAt).toLocaleDateString()}</span
									>
								</div>
							</div>
						{/if}
					</Card.Root>
				{/each}
			</div>
		{/if}
	{/if}
</div>
