<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import * as Dialog from "@my-app/ui/components/dialog";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import * as Select from "@my-app/ui/components/select";
	import * as Table from "@my-app/ui/components/table";
	import * as Tabs from "@my-app/ui/components/tabs";
	import { Textarea } from "@my-app/ui/components/textarea";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { resolve } from "$app/paths";
	import { orpc, queryClient } from "$lib/orpc";

	// ─── State ───────────────────────────────────────────────────────────────

	let createOpen = $state(false);
	let editOpen = $state(false);
	let deleteOpen = $state(false);
	let error = $state<string | null>(null);

	// Create form
	let newName = $state("");
	let newGameTitle = $state("");
	let newSearchQuery = $state("");
	let newStopWords = $state("");
	let newPublishedAfter = $state("");
	let newGameVersion = $state("");
	let newScheduleHint = $state("every 6h");

	// Edit form
	let editFeedId = $state("");
	let editName = $state("");
	let editSearchQuery = $state("");
	let editStopWords = $state("");
	let editGameVersion = $state("");
	let editScheduleHint = $state("");
	let editStatus = $state("active");

	// Delete
	let deleteFeedId = $state("");
	let deleteFeedName = $state("");

	// Video filters
	const feedFilter = writable<string | undefined>(undefined);
	const statusFilter = writable<string | undefined>(undefined);
	const videoOffset = writable(0);
	const videoLimit = 20;

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

	const createFeedMutation = createMutation(
		orpc.youtube.feeds.create.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.youtube.key() });
				createOpen = false;
				resetCreateForm();
			},
		})
	);

	const updateFeedMutation = createMutation(
		orpc.youtube.feeds.update.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.youtube.key() });
				editOpen = false;
			},
		})
	);

	const deleteFeedMutation = createMutation(
		orpc.youtube.feeds.delete.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.youtube.key() });
				deleteOpen = false;
			},
		})
	);

	const triggerDiscoveryMutation = createMutation(
		orpc.youtube.videos.triggerDiscovery.mutationOptions()
	);

	const submitVideoMutation = createMutation(
		orpc.youtube.videos.submit.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.youtube.key() });
				submitUrl = "";
				submitFeedId = "";
			},
		})
	);

	const reviewVideoMutation = createMutation(
		orpc.youtube.videos.review.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.youtube.key() });
			},
		})
	);

	// ─── Handlers ────────────────────────────────────────────────────────────

	const resetCreateForm = () => {
		newName = "";
		newGameTitle = "";
		newSearchQuery = "";
		newStopWords = "";
		newPublishedAfter = "";
		newGameVersion = "";
		newScheduleHint = "every 6h";
		error = null;
	};

	const handleCreate = async () => {
		error = null;
		try {
			await $createFeedMutation.mutateAsync({
				name: newName.trim(),
				gameTitle: newGameTitle.trim(),
				searchQuery: newSearchQuery.trim(),
				stopWords: newStopWords.trim() || undefined,
				publishedAfter: newPublishedAfter.trim() || undefined,
				gameVersion: newGameVersion.trim() || undefined,
				scheduleHint: newScheduleHint.trim() || undefined,
			});
		} catch (e) {
			error = e instanceof Error ? e.message : "Failed to create feed";
		}
	};

	const openEdit = (feed: {
		id: string;
		name: string;
		searchQuery: string;
		stopWords: string | null;
		gameVersion: string | null;
		scheduleHint: string | null;
		status: string;
	}) => {
		editFeedId = feed.id;
		editName = feed.name;
		editSearchQuery = feed.searchQuery;
		editStopWords = feed.stopWords ?? "";
		editGameVersion = feed.gameVersion ?? "";
		editScheduleHint = feed.scheduleHint ?? "";
		editStatus = feed.status;
		error = null;
		editOpen = true;
	};

	const handleUpdate = async () => {
		error = null;
		try {
			await $updateFeedMutation.mutateAsync({
				feedId: editFeedId,
				name: editName.trim(),
				searchQuery: editSearchQuery.trim(),
				stopWords: editStopWords.trim() || undefined,
				gameVersion: editGameVersion.trim() || undefined,
				scheduleHint: editScheduleHint.trim() || undefined,
				status: editStatus as "active" | "paused" | "archived",
			});
		} catch (e) {
			error = e instanceof Error ? e.message : "Failed to update feed";
		}
	};

	const openDelete = (feedId: string, feedName: string) => {
		deleteFeedId = feedId;
		deleteFeedName = feedName;
		error = null;
		deleteOpen = true;
	};

	const handleDelete = async () => {
		error = null;
		try {
			await $deleteFeedMutation.mutateAsync({ feedId: deleteFeedId });
		} catch (e) {
			error = e instanceof Error ? e.message : "Failed to delete feed";
		}
	};

	// Submit video
	let submitUrl = $state("");
	let submitFeedId = $state("");

	const handleSubmitVideo = async () => {
		error = null;
		try {
			await $submitVideoMutation.mutateAsync({
				feedId: submitFeedId,
				youtubeUrl: submitUrl.trim(),
			});
		} catch (e) {
			error = e instanceof Error ? e.message : "Failed to submit video";
		}
	};

	// ─── Helpers ─────────────────────────────────────────────────────────────

	const feedStatusColor = (status: string) => {
		switch (status) {
			case "active":
				return "default" as const;
			case "paused":
				return "secondary" as const;
			case "archived":
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
</script>

<div class="container mx-auto space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold">YouTube Feedback</h2>
			<p class="text-sm text-muted-foreground">
				Manage discovery feeds, review videos, and track playtest insights
			</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" href={resolve("/youtube/insights")}>
				View Insights
			</Button>
			<Button onclick={() => { resetCreateForm(); createOpen = true; }}>
				New Feed
			</Button>
		</div>
	</div>

	<Tabs.Root value="feeds">
		<Tabs.List>
			<Tabs.Trigger value="feeds">Feeds</Tabs.Trigger>
			<Tabs.Trigger value="videos">Videos</Tabs.Trigger>
			<Tabs.Trigger value="submit">Submit Video</Tabs.Trigger>
		</Tabs.List>

		<!-- ─── Feeds Tab ──────────────────────────────────────────── -->

		<Tabs.Content value="feeds">
			<Card.Root>
				<Card.Content class="p-0">
					{#if $feedsQuery.isPending}
						<p class="p-4 text-sm text-muted-foreground">Loading feeds...</p>
					{:else if $feedsQuery.isError}
						<p class="p-4 text-sm text-destructive">Failed to load feeds.</p>
					{:else}
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>Name</Table.Head>
									<Table.Head>Search Query</Table.Head>
									<Table.Head>Stop Words</Table.Head>
									<Table.Head>Status</Table.Head>
									<Table.Head>Last Discovery</Table.Head>
									<Table.Head class="w-40">Actions</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each $feedsQuery.data ?? [] as feed (feed.id)}
									<Table.Row>
										<Table.Cell>
											<div>
												<span class="font-medium">{feed.name}</span>
												<span class="block text-xs text-muted-foreground"
													>{feed.gameTitle}</span
												>
											</div>
										</Table.Cell>
										<Table.Cell class="max-w-[200px] truncate text-sm">
											{feed.searchQuery}
										</Table.Cell>
										<Table.Cell
											class="max-w-[150px] text-xs text-muted-foreground"
										>
											{#if feed.stopWords}
												{#each feed.stopWords.split(",").slice(0, 3) as word}
													<Badge variant="outline" class="mr-1 mb-1 text-xs"
														>{word.trim()}</Badge
													>
												{/each}
												{#if feed.stopWords.split(",").length > 3}
													<span class="text-muted-foreground"
														>+{feed.stopWords.split(",").length - 3}</span
													>
												{/if}
											{:else}
												<span class="text-muted-foreground">—</span>
											{/if}
										</Table.Cell>
										<Table.Cell>
											<Badge variant={feedStatusColor(feed.status)}
												>{feed.status}</Badge
											>
										</Table.Cell>
										<Table.Cell class="text-sm text-muted-foreground">
											{feed.lastDiscoveryAt ? new Date(feed.lastDiscoveryAt).toLocaleString() : "Never"}
										</Table.Cell>
										<Table.Cell>
											<div class="flex gap-1">
												<Button
													variant="ghost"
													size="sm"
													onclick={() => openEdit(feed)}
												>
													Edit
												</Button>
												<Button
													variant="ghost"
													size="sm"
													disabled={$triggerDiscoveryMutation.isPending}
													onclick={() => void $triggerDiscoveryMutation.mutateAsync({ feedId: feed.id })}
												>
													Discover
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onclick={() => openDelete(feed.id, feed.name)}
												>
													Delete
												</Button>
											</div>
										</Table.Cell>
									</Table.Row>
								{:else}
									<Table.Row>
										<Table.Cell
											colspan={6}
											class="text-center text-muted-foreground"
										>
											No feeds configured. Create one to start discovering
											videos.
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					{/if}
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<!-- ─── Videos Tab ─────────────────────────────────────────── -->

		<Tabs.Content value="videos">
			<div class="mb-4 flex gap-2">
				<Select.Root
					type="single"
					onValueChange={(v) => { feedFilter.set(v || undefined); videoOffset.set(0); }}
				>
					<Select.Trigger class="w-[200px]">
						<span
							>{$feedFilter ? ($feedsQuery.data?.find((f) => f.id === $feedFilter)?.name ?? "Feed") : "All Feeds"}</span
						>
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
					onValueChange={(v) => { statusFilter.set(v || undefined); videoOffset.set(0); }}
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
														onclick={() => void $reviewVideoMutation.mutateAsync({
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
														onclick={() => void $reviewVideoMutation.mutateAsync({
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
											colspan={5}
											class="text-center text-muted-foreground"
										>
											No videos found.
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					{/if}
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<!-- ─── Submit Video Tab ───────────────────────────────────── -->

		<Tabs.Content value="submit">
			<Card.Root class="max-w-lg">
				<Card.Header>
					<Card.Title>Submit Video</Card.Title>
					<Card.Description
						>Add a YouTube video URL to a feed for processing</Card.Description
					>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="submit-feed">Feed</Label>
						<Select.Root
							type="single"
							onValueChange={(v) => { submitFeedId = v; }}
						>
							<Select.Trigger id="submit-feed">
								<span
									>{submitFeedId ? ($feedsQuery.data?.find((f) => f.id === submitFeedId)?.name ?? "Select feed") : "Select feed"}</span
								>
							</Select.Trigger>
							<Select.Content>
								{#each $feedsQuery.data ?? [] as feed (feed.id)}
									<Select.Item value={feed.id}>{feed.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-2">
						<Label for="submit-url">YouTube URL</Label>
						<Input
							id="submit-url"
							placeholder="https://youtube.com/watch?v=..."
							bind:value={submitUrl}
						/>
					</div>
					{#if error}
						<p class="text-sm text-destructive">{error}</p>
					{/if}
				</Card.Content>
				<Card.Footer>
					<Button
						disabled={!submitFeedId || !submitUrl.trim() || $submitVideoMutation.isPending}
						onclick={() => void handleSubmitVideo()}
					>
						{$submitVideoMutation.isPending ? "Submitting..." : "Submit Video"}
					</Button>
				</Card.Footer>
			</Card.Root>
		</Tabs.Content>
	</Tabs.Root>
</div>

<!-- ─── Create Feed Dialog ─────────────────────────────────────────────────── -->

<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Create Discovery Feed</Dialog.Title>
			<Dialog.Description>
				Set up a recurring search to discover YouTube playtest videos
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="create-name">Feed Name</Label>
				<Input
					id="create-name"
					placeholder="e.g. Alpha Playtest Feedback"
					bind:value={newName}
				/>
			</div>
			<div class="space-y-2">
				<Label for="create-game">Game Title</Label>
				<Input
					id="create-game"
					placeholder="e.g. Starforge Arena"
					bind:value={newGameTitle}
				/>
			</div>
			<div class="space-y-2">
				<Label for="create-query">Search Query</Label>
				<Input
					id="create-query"
					placeholder="e.g. Starforge Arena playtest feedback"
					bind:value={newSearchQuery}
				/>
			</div>
			<div class="space-y-2">
				<Label for="create-stop">Stop Words</Label>
				<Textarea
					id="create-stop"
					placeholder="Comma separated: speedrun, montage, meme, compilation"
					bind:value={newStopWords}
					rows={2}
				/>
				<p class="text-xs text-muted-foreground">
					Videos with these words in the title will be filtered out during
					discovery
				</p>
			</div>
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="create-after">Published After</Label>
					<Input id="create-after" type="date" bind:value={newPublishedAfter} />
				</div>
				<div class="space-y-2">
					<Label for="create-version">Game Version</Label>
					<Input
						id="create-version"
						placeholder="e.g. 0.9.3"
						bind:value={newGameVersion}
					/>
				</div>
			</div>
			<div class="space-y-2">
				<Label for="create-schedule">Schedule</Label>
				<Input
					id="create-schedule"
					placeholder="e.g. every 6h"
					bind:value={newScheduleHint}
				/>
			</div>
			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (createOpen = false)}
				>Cancel</Button
			>
			<Button
				disabled={!newName.trim() || !newGameTitle.trim() || !newSearchQuery.trim() || $createFeedMutation.isPending}
				onclick={() => void handleCreate()}
			>
				{$createFeedMutation.isPending ? "Creating..." : "Create Feed"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- ─── Edit Feed Dialog ───────────────────────────────────────────────────── -->

<Dialog.Root bind:open={editOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header> <Dialog.Title>Edit Feed</Dialog.Title> </Dialog.Header>
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="edit-name">Feed Name</Label>
				<Input id="edit-name" bind:value={editName} />
			</div>
			<div class="space-y-2">
				<Label for="edit-query">Search Query</Label>
				<Input id="edit-query" bind:value={editSearchQuery} />
			</div>
			<div class="space-y-2">
				<Label for="edit-stop">Stop Words</Label>
				<Textarea id="edit-stop" bind:value={editStopWords} rows={2} />
				<p class="text-xs text-muted-foreground">
					Comma separated words to filter out irrelevant videos
				</p>
			</div>
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="edit-version">Game Version</Label>
					<Input id="edit-version" bind:value={editGameVersion} />
				</div>
				<div class="space-y-2">
					<Label for="edit-schedule">Schedule</Label>
					<Input id="edit-schedule" bind:value={editScheduleHint} />
				</div>
			</div>
			<div class="space-y-2">
				<Label>Status</Label>
				<Select.Root
					type="single"
					value={editStatus}
					onValueChange={(v) => { editStatus = v; }}
				>
					<Select.Trigger> <span>{editStatus}</span> </Select.Trigger>
					<Select.Content>
						<Select.Item value="active">Active</Select.Item>
						<Select.Item value="paused">Paused</Select.Item>
						<Select.Item value="archived">Archived</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (editOpen = false)}
				>Cancel</Button
			>
			<Button
				disabled={$updateFeedMutation.isPending}
				onclick={() => void handleUpdate()}
			>
				{$updateFeedMutation.isPending ? "Saving..." : "Save Changes"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- ─── Delete Feed Dialog ─────────────────────────────────────────────────── -->

<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete Feed</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete "{deleteFeedName}"? This will also
				remove all associated videos, transcripts, and signals. This action
				cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		{#if error}
			<p class="text-sm text-destructive">{error}</p>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteOpen = false)}
				>Cancel</Button
			>
			<Button
				variant="destructive"
				disabled={$deleteFeedMutation.isPending}
				onclick={() => void handleDelete()}
			>
				{$deleteFeedMutation.isPending ? "Deleting..." : "Delete Feed"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
