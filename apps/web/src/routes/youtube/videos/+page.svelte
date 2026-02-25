<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import * as Select from "@my-app/ui/components/select";
	import * as Table from "@my-app/ui/components/table";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { get } from "svelte/store";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { derived } from "svelte/store";
	import { orpc, queryClient } from "$lib/orpc";

	// ─── URL-driven filters ───────────────────────────────────────────────────

	const videoLimit = 20;

	const feedFilter = derived(page, ($p) => $p.url.searchParams.get("feed") ?? undefined);
	const statusFilter = derived(page, ($p) => $p.url.searchParams.get("status") ?? undefined);
	const videoOffset = derived(page, ($p) => Number($p.url.searchParams.get("offset") ?? 0));

	const setFilters = (params: { feed?: string; status?: string; offset?: number }) => {
		const url = new URL(get(page).url);
		if (params.feed) {
			url.searchParams.set("feed", params.feed);
		} else {
			url.searchParams.delete("feed");
		}
		if (params.status) {
			url.searchParams.set("status", params.status);
		} else {
			url.searchParams.delete("status");
		}
		if (params.offset) {
			url.searchParams.set("offset", String(params.offset));
		} else {
			url.searchParams.delete("offset");
		}
		goto(url.toString(), { replaceState: true });
	};

	// ─── Queries ─────────────────────────────────────────────────────────────

	const feedsQuery = createQuery(orpc.youtube.feeds.list.queryOptions());

	const videosQuery = createQuery(
		derived(
			[feedFilter, statusFilter, videoOffset],
			([$feedFilter, $statusFilter, $videoOffset]) =>
				orpc.youtube.videos.list.queryOptions({
					input: {
						feedId: $feedFilter || undefined,
						status:
							($statusFilter as
								| "candidate"
								| "approved"
								| "rejected"
								| "ingesting"
								| "ingested"
								| "failed"
								| undefined) || undefined,
						limit: videoLimit,
						offset: $videoOffset,
					},
				})
		)
	);

	// ─── Mutations ───────────────────────────────────────────────────────────

	const reviewVideoMutation = createMutation(
		orpc.youtube.videos.review.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.youtube.key() });
			},
		})
	);

	// ─── Helpers ─────────────────────────────────────────────────────────────

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
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold">Videos</h3>
	</div>

	<div class="flex gap-2">
		<Select.Root
			type="single"
			value={$feedFilter ?? ""}
			onValueChange={(v) => setFilters({ feed: v || undefined, status: $statusFilter, offset: 0 })}
		>
			<Select.Trigger class="w-[200px]">
				<span>
					{$feedFilter
						? ($feedsQuery.data?.find((f) => f.id === $feedFilter)?.name ?? "Feed")
						: "All Feeds"}
				</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All Feeds</Select.Item>
				{#each $feedsQuery.data ?? [] as feed (feed.id)}
					<Select.Item value={feed.id}>{feed.name}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<Select.Root
			type="single"
			value={$statusFilter ?? ""}
			onValueChange={(v) => setFilters({ feed: $feedFilter, status: v || undefined, offset: 0 })}
		>
			<Select.Trigger class="w-[160px]">
				<span>{$statusFilter ?? "All Statuses"}</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All Statuses</Select.Item>
				{#each ["candidate", "approved", "rejected", "ingesting", "ingested", "failed"] as status}
					<Select.Item value={status}>{status}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<Card.Root>
		<Card.Content class="p-0">
			{#if $videosQuery.isPending}
				<p class="p-4 text-sm text-muted-foreground">Loading videos...</p>
			{:else if $videosQuery.isError}
				<p class="p-4 text-sm text-destructive">Failed to load videos.</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Title</Table.Head>
							<Table.Head>Channel</Table.Head>
							<Table.Head>Sources</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Published</Table.Head>
							<Table.Head class="w-32">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each $videosQuery.data ?? [] as video (video.id)}
							<Table.Row>
								<Table.Cell>
									<a
										href={resolve(`/youtube/videos/${video.id}`)}
										class="font-medium text-primary hover:underline"
									>
										{video.title}
									</a>
								</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">
									{video.channelName ?? "—"}
								</Table.Cell>
								<Table.Cell>
									<div class="flex gap-1">
										{#if video.captionsAvailable}
											<Badge variant="secondary" class="text-xs">CC</Badge>
										{/if}
										{#if video.autoCaptionsAvailable}
											<Badge variant="outline" class="text-xs">AUTO</Badge>
										{/if}
										{#if video.audioR2Key}
											<Badge variant="outline" class="text-xs">AUDIO</Badge>
										{/if}
										{#if video.captionsAvailable === false && video.autoCaptionsAvailable === false && !video.audioR2Key}
											<span class="text-xs text-muted-foreground">none</span>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell>
									<Badge variant={videoStatusColor(video.status)}
										>{video.status}</Badge
									>
								</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">
									{video.publishedAt ?? "—"}
								</Table.Cell>
								<Table.Cell>
									{#if video.status === "candidate"}
										<div class="flex gap-1">
											<Button
												variant="ghost"
												size="sm"
												disabled={$reviewVideoMutation.isPending}
												onclick={() =>
													void $reviewVideoMutation.mutateAsync({
														videoId: video.id,
														action: "approve",
													})}
											>
												Approve
											</Button>
											<Button
												variant="ghost"
												size="sm"
												disabled={$reviewVideoMutation.isPending}
												onclick={() =>
													void $reviewVideoMutation.mutateAsync({
														videoId: video.id,
														action: "reject",
													})}
											>
												Reject
											</Button>
										</div>
									{:else}
										<a
											href={resolve(`/youtube/videos/${video.id}`)}
											class="text-sm text-primary hover:underline"
										>
											View
										</a>
									{/if}
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell
									colspan={6}
									class="text-center text-muted-foreground"
								>
									No videos found.
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>

				<!-- Pagination -->
				{#if ($videosQuery.data?.length ?? 0) === videoLimit || $videoOffset > 0}
					<div class="flex items-center justify-between border-t px-4 py-3">
						<Button
							variant="outline"
							size="sm"
							disabled={$videoOffset === 0}
							onclick={() => setFilters({ feed: $feedFilter, status: $statusFilter, offset: Math.max(0, $videoOffset - videoLimit) })}
						>
							Previous
						</Button>
						<span class="text-sm text-muted-foreground">
							Page {Math.floor($videoOffset / videoLimit) + 1}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={($videosQuery.data?.length ?? 0) < videoLimit}
							onclick={() => setFilters({ feed: $feedFilter, status: $statusFilter, offset: $videoOffset + videoLimit })}
						>
							Next
						</Button>
					</div>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
