<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import * as Dialog from "@my-app/ui/components/dialog";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import * as Select from "@my-app/ui/components/select";
	import * as Table from "@my-app/ui/components/table";
	import { Textarea } from "@my-app/ui/components/textarea";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { resolve } from "$app/paths";
	import { orpc, queryClient } from "$lib/orpc";

	// ─── Dialog state ────────────────────────────────────────────────────────

	let createOpen = $state(false);
	let editOpen = $state(false);
	let deleteOpen = $state(false);
	let submitOpen = $state(false);
	let formError = $state<string | null>(null);

	// ─── Create form ─────────────────────────────────────────────────────────

	let newName = $state("");
	let newGameTitle = $state("");
	let newSearchQuery = $state("");
	let newStopWords = $state("");
	let newPublishedAfter = $state("");
	let newGameVersion = $state("");
	let newScheduleHint = $state("every 6h");
	let newEnableAsr = $state(false);
	let newMinDuration = $state("");

	const channelSearchStore = writable("");
	let newChannelId = $state<string | null>(null);
	let newChannelName = $state<string | null>(null);

	// ─── Edit form ───────────────────────────────────────────────────────────

	let editFeedId = $state("");
	let editName = $state("");
	let editSearchQuery = $state("");
	let editStopWords = $state("");
	let editGameVersion = $state("");
	let editScheduleHint = $state("");
	let editStatus = $state("active");
	let editEnableAsr = $state(false);
	let editMinDuration = $state("");

	// ─── Delete ──────────────────────────────────────────────────────────────

	let deleteFeedId = $state("");
	let deleteFeedName = $state("");

	// ─── Submit video ─────────────────────────────────────────────────────────

	let submitUrl = $state("");
	let submitFeedId = $state("");
	let submitFeedName = $state("");

	// ─── Queries ─────────────────────────────────────────────────────────────

	const feedsQuery = createQuery(orpc.youtube.feeds.list.queryOptions());

	const channelSearchQuery = createQuery(
		derived(channelSearchStore, ($q) =>
			orpc.youtube.channels.search.queryOptions({
				input: { query: $q.trim(), maxResults: 8 },
				enabled: $q.trim().length >= 2,
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
				submitFeedName = "";
				submitOpen = false;
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
		newChannelId = null;
		newChannelName = null;
		channelSearchStore.set("");
		newEnableAsr = false;
		newMinDuration = "";
		formError = null;
	};

	const handleCreate = async () => {
		formError = null;
		try {
			await $createFeedMutation.mutateAsync({
				name: newName.trim(),
				gameTitle: newGameTitle.trim(),
				searchQuery: newSearchQuery.trim() || newGameTitle.trim(),
				channelId: newChannelId ?? undefined,
				stopWords: newStopWords.trim() || undefined,
				publishedAfter: newPublishedAfter.trim() || undefined,
				gameVersion: newGameVersion.trim() || undefined,
				scheduleHint: newScheduleHint.trim() || undefined,
				enableAsr: newEnableAsr,
				minDurationSeconds: newMinDuration ? Number(newMinDuration) : undefined,
			});
		} catch (e) {
			formError = e instanceof Error ? e.message : "Failed to create feed";
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
		enableAsr: boolean;
		minDurationSeconds: number | null;
	}) => {
		editFeedId = feed.id;
		editName = feed.name;
		editSearchQuery = feed.searchQuery;
		editStopWords = feed.stopWords ?? "";
		editGameVersion = feed.gameVersion ?? "";
		editScheduleHint = feed.scheduleHint ?? "";
		editStatus = feed.status;
		editEnableAsr = feed.enableAsr;
		editMinDuration = feed.minDurationSeconds ? String(feed.minDurationSeconds) : "";
		formError = null;
		editOpen = true;
	};

	const handleUpdate = async () => {
		formError = null;
		try {
			await $updateFeedMutation.mutateAsync({
				feedId: editFeedId,
				name: editName.trim(),
				searchQuery: editSearchQuery.trim(),
				stopWords: editStopWords.trim() || undefined,
				gameVersion: editGameVersion.trim() || undefined,
				scheduleHint: editScheduleHint.trim() || undefined,
				status: editStatus as "active" | "paused" | "archived",
				enableAsr: editEnableAsr,
				minDurationSeconds: editMinDuration ? Number(editMinDuration) : undefined,
			});
		} catch (e) {
			formError = e instanceof Error ? e.message : "Failed to update feed";
		}
	};

	const openDelete = (feedId: string, feedName: string) => {
		deleteFeedId = feedId;
		deleteFeedName = feedName;
		formError = null;
		deleteOpen = true;
	};

	const handleDelete = async () => {
		formError = null;
		try {
			await $deleteFeedMutation.mutateAsync({ feedId: deleteFeedId });
		} catch (e) {
			formError = e instanceof Error ? e.message : "Failed to delete feed";
		}
	};

	const openSubmit = (feedId: string, feedName: string) => {
		submitFeedId = feedId;
		submitFeedName = feedName;
		submitUrl = "";
		formError = null;
		submitOpen = true;
	};

	const handleSubmitVideo = async () => {
		formError = null;
		try {
			await $submitVideoMutation.mutateAsync({
				feedId: submitFeedId,
				youtubeUrl: submitUrl.trim(),
			});
		} catch (e) {
			formError = e instanceof Error ? e.message : "Failed to submit video";
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
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold">Discovery Feeds</h3>
		<Button onclick={() => { resetCreateForm(); createOpen = true; }}
			>New Feed</Button
		>
	</div>

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
							<Table.Head>Source</Table.Head>
							<Table.Head>Stop Words</Table.Head>
							<Table.Head>ASR</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Last Discovery</Table.Head>
							<Table.Head class="w-52">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each $feedsQuery.data ?? [] as feed (feed.id)}
							<Table.Row>
								<Table.Cell>
									<div>
										<a
											href="{resolve('/youtube/videos')}?feed={feed.id}"
											class="font-medium text-primary hover:underline"
										>{feed.name}</a>
										<span class="block text-xs text-muted-foreground"
											>{feed.gameTitle}</span
										>
									</div>
								</Table.Cell>
								<Table.Cell class="max-w-[220px] text-sm">
									{#if feed.channelId}
										<div class="flex flex-col gap-1">
											<Badge variant="secondary" class="w-fit text-xs"
												>Channel</Badge
											>
											<a
												href="https://www.youtube.com/channel/{feed.channelId}"
												target="_blank"
												rel="noopener noreferrer"
												class="truncate font-mono text-xs text-primary hover:underline"
												>{feed.channelId}</a
											>
										</div>
									{:else}
										<span class="truncate text-muted-foreground"
											>{feed.searchQuery}</span
										>
									{/if}
								</Table.Cell>
								<Table.Cell class="max-w-[150px] text-xs text-muted-foreground">
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
									{#if feed.enableAsr}
										<Badge variant="secondary" class="text-xs">ASR</Badge>
									{/if}
									{#if feed.minDurationSeconds}
										<Badge variant="outline" class="text-xs">&ge;{feed.minDurationSeconds}s</Badge>
									{/if}
									{#if !feed.enableAsr}
										{#if !feed.minDurationSeconds}
											<span class="text-xs text-muted-foreground">—</span>
										{/if}
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
									<div class="flex flex-wrap gap-1">
										<Button
											variant="ghost"
											size="sm"
											onclick={() => openSubmit(feed.id, feed.name)}
										>
											Submit
										</Button>
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
									colspan={7}
									class="text-center text-muted-foreground"
								>
									No feeds configured. Create one to start discovering videos.
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<!-- ─── Submit Video Dialog ────────────────────────────────────────────────── -->

<Dialog.Root bind:open={submitOpen}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Submit Video</Dialog.Title>
			<Dialog.Description>
				Add a YouTube video URL to <strong>{submitFeedName}</strong> for
				processing
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="submit-url">YouTube URL</Label>
				<Input
					id="submit-url"
					placeholder="https://youtube.com/watch?v=..."
					bind:value={submitUrl}
				/>
			</div>
			{#if formError}
				<p class="text-sm text-destructive">{formError}</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (submitOpen = false)}
				>Cancel</Button
			>
			<Button
				disabled={!submitUrl.trim() || $submitVideoMutation.isPending}
				onclick={() => void handleSubmitVideo()}
			>
				{$submitVideoMutation.isPending ? "Submitting..." : "Submit Video"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- ─── Create Feed Dialog ─────────────────────────────────────────────────── -->

<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="flex max-h-[90vh] max-w-lg flex-col">
		<Dialog.Header>
			<Dialog.Title>Create Discovery Feed</Dialog.Title>
			<Dialog.Description>
				Set up a recurring search to discover YouTube playtest videos
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4 overflow-y-auto pr-1">
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
				<Label
					>Game Channel
					<span class="font-normal text-muted-foreground"
						>(optional)</span
					></Label
				>
				{#if newChannelId}
					<div class="flex items-center gap-2 rounded-md border px-3 py-2">
						<span class="flex-1 text-sm font-medium">{newChannelName}</span>
						<span class="font-mono text-xs text-muted-foreground"
							>{newChannelId}</span
						>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => { newChannelId = null; newChannelName = null; channelSearchStore.set(""); }}
							>✕</Button
						>
					</div>
				{:else}
					<div class="relative">
						<Input
							placeholder="Search for a game channel…"
							value={$channelSearchStore}
							oninput={(e) => channelSearchStore.set((e.currentTarget as HTMLInputElement).value)}
						/>
						{#if $channelSearchQuery.isFetching}
							<div
								class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover px-3 py-2 shadow-md"
							>
								<p class="text-xs text-muted-foreground">Searching…</p>
							</div>
						{:else if $channelSearchQuery.data && $channelSearchQuery.data.length > 0}
							<div
								class="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 divide-y overflow-y-auto rounded-md border bg-popover shadow-md"
							>
								{#each $channelSearchQuery.data as ch (ch.channelId)}
									<button
										type="button"
										class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
										onclick={() => { newChannelId = ch.channelId; newChannelName = ch.name; channelSearchStore.set(""); }}
									>
										{#if ch.thumbnailUrl}
											<img
												src={ch.thumbnailUrl}
												alt={ch.name}
												class="h-8 w-8 shrink-0 rounded-full object-cover"
											>
										{/if}
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-medium">{ch.name}</p>
											{#if ch.subscriberCount}
												<p class="text-xs text-muted-foreground">
													{ch.subscriberCount}
												</p>
											{/if}
										</div>
									</button>
								{/each}
							</div>
						{:else if $channelSearchQuery.data && $channelSearchQuery.data.length === 0 && $channelSearchStore.trim().length >= 2}
							<div
								class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover px-3 py-2 shadow-md"
							>
								<p class="text-xs text-muted-foreground">No channels found.</p>
							</div>
						{/if}
					</div>
					<p class="text-xs text-muted-foreground">
						When set, discovery fetches videos directly from this channel —
						search query is not used.
					</p>
				{/if}
			</div>
			<div
				class="space-y-2 {newChannelId ? 'pointer-events-none select-none opacity-40' : ''}"
			>
				<Label for="create-query">
					Search Query
					{#if !newChannelId}
						<span class="text-destructive">*</span>
					{:else}
						<span class="text-xs font-normal text-muted-foreground"
							>(unused — channel set)</span
						>
					{/if}
				</Label>
				<Input
					id="create-query"
					placeholder="e.g. Starforge Arena playtest feedback"
					bind:value={newSearchQuery}
					disabled={!!newChannelId}
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
			<div class="flex items-center gap-3 rounded-md border p-3">
				<input
					id="create-enable-asr"
					type="checkbox"
					class="h-4 w-4 rounded border-input accent-primary"
					bind:checked={newEnableAsr}
				>
				<div>
					<Label for="create-enable-asr" class="cursor-pointer font-medium">
						Enable ASR (audio transcription)
					</Label>
					<p class="text-xs text-muted-foreground">
						Fall back to Whisper audio download when captions are unavailable.
						Expensive — enable only for high-value feeds.
					</p>
				</div>
			</div>
			<div class="space-y-2">
				<Label for="create-min-duration">Min Video Duration (seconds)</Label>
				<Input
					id="create-min-duration"
					type="number"
					min="0"
					max="86400"
					placeholder="e.g. 300 to skip Shorts and trailers"
					bind:value={newMinDuration}
				/>
				<p class="text-xs text-muted-foreground">
					Videos shorter than this will be skipped (leave empty for no minimum)
				</p>
			</div>
			{#if formError}
				<p class="text-sm text-destructive">{formError}</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (createOpen = false)}
				>Cancel</Button
			>
			<Button
				disabled={!newName.trim() || !newGameTitle.trim() || (!newChannelId && !newSearchQuery.trim()) || $createFeedMutation.isPending}
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
			<div class="flex items-center gap-3 rounded-md border p-3">
				<input
					id="edit-enable-asr"
					type="checkbox"
					class="h-4 w-4 rounded border-input accent-primary"
					bind:checked={editEnableAsr}
				>
				<div>
					<Label for="edit-enable-asr" class="cursor-pointer font-medium">
						Enable ASR (audio transcription)
					</Label>
					<p class="text-xs text-muted-foreground">
						Fall back to Whisper audio download when captions are unavailable.
						Expensive — enable only for high-value feeds.
					</p>
				</div>
			</div>
			<div class="space-y-2">
				<Label for="edit-min-duration">Min Video Duration (seconds)</Label>
				<Input
					id="edit-min-duration"
					type="number"
					min="0"
					max="86400"
					placeholder="e.g. 300 to skip Shorts and trailers"
					bind:value={editMinDuration}
				/>
				<p class="text-xs text-muted-foreground">
					Videos shorter than this will be skipped (leave empty for no minimum)
				</p>
			</div>
			<div class="space-y-2">
				<Label>Status</Label>
				<Select.Root
					type="single"
					value={editStatus}
					onValueChange={(v) => { editStatus = v; }}
				>
					<Select.Trigger><span>{editStatus}</span></Select.Trigger>
					<Select.Content>
						<Select.Item value="active">Active</Select.Item>
						<Select.Item value="paused">Paused</Select.Item>
						<Select.Item value="archived">Archived</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			{#if formError}
				<p class="text-sm text-destructive">{formError}</p>
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
		{#if formError}
			<p class="text-sm text-destructive">{formError}</p>
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
