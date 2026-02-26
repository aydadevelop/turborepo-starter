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

	// ─── Dialog state ────────────────────────────────────────────────────────

	let createOpen = $state(false);
	let editOpen = $state(false);
	let deleteOpen = $state(false);
	let submitOpen = $state(false);
	let formError = $state<string | null>(null);

	// ─── Create form ─────────────────────────────────────────────────────────

	type FeedSourceMode =
		| "search"
		| "game_channel"
		| "user_channel_query"
		| "playlist";

	let createSourceMode = $state<FeedSourceMode>("search");
	let newName = $state("");
	let newGameTitle = $state("");
	let newSearchQuery = $state("");
	let newUserChannelQuery = $state("");
	let newPlaylistInput = $state("");
	let newSearchStopWords = $state("");
	let newTitleStopWords = $state("");
	let newPublishedAfter = $state("");
	let newGameVersion = $state("");
	let newScheduleHint = $state("every 6h");
	let newEnableAsr = $state(false);
	let newMinDuration = $state("");

	const gameChannelSearchStore = writable("");
	let newGameChannelId = $state<string | null>(null);
	let newGameChannelName = $state<string | null>(null);

	const userChannelSearchStore = writable("");
	let newUserChannelId = $state<string | null>(null);
	let newUserChannelName = $state<string | null>(null);

	// ─── Edit form ───────────────────────────────────────────────────────────

	let editFeedId = $state("");
	let editName = $state("");
	let editSourceMode = $state<FeedSourceMode>("search");
	let editSearchQuery = $state("");
	let editUserChannelQuery = $state("");
	let editPlaylistInput = $state("");
	let editSearchStopWords = $state("");
	let editTitleStopWords = $state("");
	let editGameVersion = $state("");
	let editScheduleHint = $state("");
	let editStatus = $state("active");
	let editEnableAsr = $state(false);
	let editMinDuration = $state("");

	const editGameChannelSearchStore = writable("");
	let editGameChannelId = $state<string | null>(null);
	let editGameChannelName = $state<string | null>(null);

	const editUserChannelSearchStore = writable("");
	let editUserChannelId = $state<string | null>(null);
	let editUserChannelName = $state<string | null>(null);

	// ─── Delete ──────────────────────────────────────────────────────────────

	let deleteFeedId = $state("");
	let deleteFeedName = $state("");

	// ─── Submit video ─────────────────────────────────────────────────────────

	let submitUrl = $state("");
	let submitFeedId = $state("");
	let submitFeedName = $state("");

	// ─── Queries ─────────────────────────────────────────────────────────────

	const feedsQuery = createQuery(orpc.youtube.feeds.list.queryOptions());

	const channelSearchOptions = (query: string) =>
		orpc.youtube.channels.search.queryOptions({
			input: { query: query.trim(), maxResults: 8 },
			enabled: query.trim().length >= 2,
		});

	const gameChannelSearchQuery = createQuery(
		derived(gameChannelSearchStore, ($q) => channelSearchOptions($q))
	);

	const userChannelSearchQuery = createQuery(
		derived(userChannelSearchStore, ($q) => channelSearchOptions($q))
	);

	const editGameChannelSearchQuery = createQuery(
		derived(editGameChannelSearchStore, ($q) => channelSearchOptions($q))
	);

	const editUserChannelSearchQuery = createQuery(
		derived(editUserChannelSearchStore, ($q) => channelSearchOptions($q))
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
		createSourceMode = "search";
		newName = "";
		newGameTitle = "";
		newSearchQuery = "";
		newUserChannelQuery = "";
		newPlaylistInput = "";
		newSearchStopWords = "";
		newTitleStopWords = "";
		newPublishedAfter = "";
		newGameVersion = "";
		newScheduleHint = "every 6h";
		newGameChannelId = null;
		newGameChannelName = null;
		gameChannelSearchStore.set("");
		newUserChannelId = null;
		newUserChannelName = null;
		userChannelSearchStore.set("");
		newEnableAsr = false;
		newMinDuration = "";
		formError = null;
	};

	const handleCreate = async () => {
		formError = null;
		try {
			const sourceInput = getCreateSourceInput();
			await $createFeedMutation.mutateAsync({
				name: newName.trim(),
				gameTitle: newGameTitle.trim(),
				sourceMode: sourceInput.sourceMode,
				searchQuery: sourceInput.searchQuery,
				scopeChannelId: sourceInput.scopeChannelId,
				scopeChannelName: sourceInput.scopeChannelName,
				playlistId: sourceInput.playlistId,
				searchStopWords:
					sourceInput.sourceMode === "search"
						? newSearchStopWords.trim() || undefined
						: undefined,
				titleStopWords: newTitleStopWords.trim() || undefined,
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
		sourceMode: FeedSourceMode;
		searchQuery: string;
		scopeChannelId: string | null;
		scopeChannelName: string | null;
		playlistId: string | null;
		searchStopWords: string | null;
		titleStopWords: string | null;
		gameVersion: string | null;
		scheduleHint: string | null;
		status: string;
		enableAsr: boolean;
		minDurationSeconds: number | null;
	}) => {
		editFeedId = feed.id;
		editName = feed.name;
		editSourceMode = feed.sourceMode;
		editSearchQuery = feed.sourceMode === "search" ? feed.searchQuery : "";
		editUserChannelQuery =
			feed.sourceMode === "user_channel_query" ? feed.searchQuery : "";
		editPlaylistInput =
			feed.sourceMode === "playlist" ? (feed.playlistId ?? "") : "";
		editSearchStopWords = feed.searchStopWords ?? "";
		editTitleStopWords = feed.titleStopWords ?? "";
		editGameChannelId =
			feed.sourceMode === "game_channel" ? feed.scopeChannelId : null;
		editGameChannelName =
			feed.sourceMode === "game_channel"
				? (feed.scopeChannelName ?? feed.scopeChannelId)
				: null;
		editUserChannelId =
			feed.sourceMode === "user_channel_query" ? feed.scopeChannelId : null;
		editUserChannelName =
			feed.sourceMode === "user_channel_query"
				? (feed.scopeChannelName ?? feed.scopeChannelId)
				: null;
		editGameChannelSearchStore.set("");
		editUserChannelSearchStore.set("");
		editGameVersion = feed.gameVersion ?? "";
		editScheduleHint = feed.scheduleHint ?? "";
		editStatus = feed.status;
		editEnableAsr = feed.enableAsr;
		editMinDuration = feed.minDurationSeconds
			? String(feed.minDurationSeconds)
			: "";
		formError = null;
		editOpen = true;
	};

	const handleUpdate = async () => {
		formError = null;
		try {
			const sourceInput = getEditSourceInput();
			await $updateFeedMutation.mutateAsync({
				feedId: editFeedId,
				name: editName.trim(),
				sourceMode: sourceInput.sourceMode,
				searchQuery: sourceInput.searchQuery,
				scopeChannelId: sourceInput.scopeChannelId,
				scopeChannelName: sourceInput.scopeChannelName,
				playlistId: sourceInput.playlistId,
				searchStopWords:
					sourceInput.sourceMode === "search"
						? editSearchStopWords.trim() || null
						: null,
				titleStopWords: editTitleStopWords.trim() || null,
				gameVersion: editGameVersion.trim() || undefined,
				scheduleHint: editScheduleHint.trim() || undefined,
				status: editStatus as "active" | "paused" | "archived",
				enableAsr: editEnableAsr,
				minDurationSeconds: editMinDuration
					? Number(editMinDuration)
					: undefined,
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

	const parsePlaylistId = (rawValue: string) => {
		const value = rawValue.trim();
		if (!value) {
			return "";
		}
		try {
			const url = new URL(value);
			return (url.searchParams.get("list") ?? value).trim();
		} catch {
			return value;
		}
	};

	const isCreateSourceValid = () => {
		switch (createSourceMode) {
			case "game_channel":
				return Boolean(newGameChannelId);
			case "search":
				return Boolean(newSearchQuery.trim());
			case "user_channel_query":
				return Boolean(newUserChannelId && newUserChannelQuery.trim());
			case "playlist":
				return Boolean(parsePlaylistId(newPlaylistInput));
			default:
				return false;
		}
	};

	const getCreateSourceInput = (): {
		sourceMode: FeedSourceMode;
		searchQuery?: string;
		scopeChannelId?: string;
		scopeChannelName?: string;
		playlistId?: string;
	} => {
		const parsedPlaylistId = parsePlaylistId(newPlaylistInput);
		switch (createSourceMode) {
			case "game_channel":
				return {
					sourceMode: "game_channel",
					scopeChannelId: newGameChannelId ?? undefined,
					scopeChannelName: newGameChannelName ?? undefined,
				};
			case "search":
				return {
					sourceMode: "search",
					searchQuery: newSearchQuery.trim(),
				};
			case "user_channel_query":
				return {
					sourceMode: "user_channel_query",
					searchQuery: newUserChannelQuery.trim(),
					scopeChannelId: newUserChannelId ?? undefined,
					scopeChannelName: newUserChannelName ?? undefined,
				};
			case "playlist":
				return {
					sourceMode: "playlist",
					playlistId: parsedPlaylistId || undefined,
				};
			default:
				return {
					sourceMode: "search",
					searchQuery: newSearchQuery.trim(),
				};
		}
	};

	const isEditSourceValid = () => {
		switch (editSourceMode) {
			case "game_channel":
				return Boolean(editGameChannelId);
			case "search":
				return Boolean(editSearchQuery.trim());
			case "user_channel_query":
				return Boolean(editUserChannelId && editUserChannelQuery.trim());
			case "playlist":
				return Boolean(parsePlaylistId(editPlaylistInput));
			default:
				return false;
		}
	};

	const getEditSourceInput = (): {
		sourceMode: FeedSourceMode;
		searchQuery: string;
		scopeChannelId: string | null;
		scopeChannelName: string | null;
		playlistId: string | null;
	} => {
		const parsedPlaylistId = parsePlaylistId(editPlaylistInput);
		switch (editSourceMode) {
			case "game_channel":
				return {
					sourceMode: "game_channel",
					searchQuery: "",
					scopeChannelId: editGameChannelId,
					scopeChannelName: editGameChannelName,
					playlistId: null,
				};
			case "search":
				return {
					sourceMode: "search",
					searchQuery: editSearchQuery.trim(),
					scopeChannelId: null,
					scopeChannelName: null,
					playlistId: null,
				};
			case "user_channel_query":
				return {
					sourceMode: "user_channel_query",
					searchQuery: editUserChannelQuery.trim(),
					scopeChannelId: editUserChannelId,
					scopeChannelName: editUserChannelName,
					playlistId: null,
				};
			case "playlist":
				return {
					sourceMode: "playlist",
					searchQuery: "",
					scopeChannelId: null,
					scopeChannelName: null,
					playlistId: parsedPlaylistId || null,
				};
			default:
				return {
					sourceMode: "search",
					searchQuery: editSearchQuery.trim(),
					scopeChannelId: null,
					scopeChannelName: null,
					playlistId: null,
				};
		}
	};

	const limitSymbols = (value: string, max = 72) =>
		value.length > max ? `${value.slice(0, max - 1)}...` : value;

	const splitCommaWords = (value: string | null | undefined) =>
		(value ?? "")
			.split(",")
			.map((word) => word.trim())
			.filter(Boolean);

	const sourceModeLabel = (mode: FeedSourceMode) => {
		switch (mode) {
			case "search":
				return "Search Query";
			case "game_channel":
				return "Game Channel";
			case "user_channel_query":
				return "User Channel + Query";
			case "playlist":
				return "Playlist";
			default:
				return mode;
		}
	};

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
	<div class="flex justify-end">
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
							<Table.Head>Filters</Table.Head>
							<Table.Head>ASR</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Last Discovery</Table.Head>
							<Table.Head class="w-52">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each $feedsQuery.data ?? [] as feed (feed.id)}
							{@const sourceVariant =
								feed.sourceMode === "search" ? "outline" : "secondary"}
							{@const searchWords = splitCommaWords(feed.searchStopWords)}
							{@const titleWords = splitCommaWords(feed.titleStopWords)}
							{@const scopeLabel =
								feed.scopeChannelName ?? feed.scopeChannelId ?? "—"}
							<Table.Row>
								<Table.Cell>
									<div>
										<a
											href="{resolve('/youtube/videos')}?feed={feed.id}"
											title={feed.name}
											class="font-medium text-primary hover:underline"
											>{limitSymbols(feed.name, 52)}</a
										>
										<span
											class="block text-xs text-muted-foreground"
											title={feed.gameTitle}
										>
											{limitSymbols(feed.gameTitle, 52)}
										</span>
									</div>
								</Table.Cell>
								<Table.Cell class="max-w-[260px] text-sm">
									<div class="flex flex-col gap-1">
										<Badge variant={sourceVariant} class="w-fit text-xs">
											{sourceModeLabel(feed.sourceMode)}
										</Badge>
										{#if feed.sourceMode === "playlist"}
											{#if feed.playlistId}
												<a
													href="https://www.youtube.com/playlist?list={feed.playlistId}"
													target="_blank"
													rel="noopener noreferrer"
													title={feed.playlistId}
													class="truncate font-mono text-xs text-primary hover:underline"
												>
													{limitSymbols(feed.playlistId, 42)}
												</a>
											{:else}
												<span class="text-xs text-muted-foreground">—</span>
											{/if}
										{:else if feed.sourceMode === "game_channel"}
											{#if feed.scopeChannelId}
												<a
													href="https://www.youtube.com/channel/{feed.scopeChannelId}"
													target="_blank"
													rel="noopener noreferrer"
													title={scopeLabel}
													class="truncate text-xs text-primary hover:underline"
												>
													{limitSymbols(scopeLabel, 42)}
												</a>
											{:else}
												<span class="text-xs text-muted-foreground">—</span>
											{/if}
										{:else if feed.sourceMode === "user_channel_query"}
											{#if feed.scopeChannelId}
												<a
													href="https://www.youtube.com/channel/{feed.scopeChannelId}"
													target="_blank"
													rel="noopener noreferrer"
													title={scopeLabel}
													class="truncate text-xs text-primary hover:underline"
												>
													{limitSymbols(scopeLabel, 42)}
												</a>
											{:else}
												<span class="text-xs text-muted-foreground">—</span>
											{/if}
											<p
												class="truncate text-xs text-muted-foreground"
												title={feed.searchQuery || undefined}
											>
												{feed.searchQuery
													? limitSymbols(feed.searchQuery, 52)
													: "—"}
											</p>
										{:else}
											<p
												class="truncate text-xs text-muted-foreground"
												title={feed.searchQuery || undefined}
											>
												{feed.searchQuery
													? limitSymbols(feed.searchQuery, 52)
													: "—"}
											</p>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="max-w-[220px] space-y-1 text-xs">
									<div class="flex items-start gap-2">
										<span
											class="mt-0.5 min-w-9 text-[10px] text-muted-foreground"
										>
											Query
										</span>
										{#if feed.sourceMode === "search" && searchWords.length > 0}
											<div class="flex flex-wrap gap-1">
												{#each searchWords.slice(0, 3) as word}
													<Badge
														variant="outline"
														class="text-[10px]"
														title={word}
													>
														{limitSymbols(word, 20)}
													</Badge>
												{/each}
												{#if searchWords.length > 3}
													<span class="text-[10px] text-muted-foreground">
														+{searchWords.length - 3}
													</span>
												{/if}
											</div>
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</div>
									<div class="flex items-start gap-2">
										<span
											class="mt-0.5 min-w-9 text-[10px] text-muted-foreground"
										>
											Title
										</span>
										{#if titleWords.length > 0}
											<div class="flex flex-wrap gap-1">
												{#each titleWords.slice(0, 3) as word}
													<Badge
														variant="outline"
														class="text-[10px]"
														title={word}
													>
														{limitSymbols(word, 20)}
													</Badge>
												{/each}
												{#if titleWords.length > 3}
													<span class="text-[10px] text-muted-foreground">
														+{titleWords.length - 3}
													</span>
												{/if}
											</div>
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell>
									{#if feed.enableAsr}
										<Badge variant="secondary" class="text-xs">ASR</Badge>
									{/if}
									{#if feed.minDurationSeconds}
										<Badge variant="outline" class="text-xs"
											>&ge;{feed.minDurationSeconds}s</Badge
										>
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
								<Table.Cell
									class="text-sm text-muted-foreground"
									title={feed.lastDiscoveryAt ?? undefined}
								>
									{feed.lastDiscoveryAt
										? new Date(feed.lastDiscoveryAt).toLocaleString()
										: "Never"}
								</Table.Cell>
								<Table.Cell>
									<div class="flex flex-wrap gap-1">
										<Button
											variant="outline"
											size="sm"
											onclick={() => openSubmit(feed.id, feed.name)}
										>
											Submit
										</Button>
										<Button
											variant="outline"
											size="sm"
											onclick={() => openEdit(feed)}
										>
											Edit
										</Button>
										<Button
											variant="outline"
											size="sm"
											disabled={$triggerDiscoveryMutation.isPending}
											onclick={() => void $triggerDiscoveryMutation.mutateAsync({ feedId: feed.id })}
										>
											Discover
										</Button>
										<Button
											variant="outline"
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
				Set up a recurring discovery source for YouTube playtest videos
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
				<Label>Discovery Source</Label>
				<Tabs.Root bind:value={createSourceMode}>
					<Tabs.List class="grid h-auto w-full grid-cols-2 gap-1">
						<Tabs.Trigger value="game_channel" class="h-8 text-xs">
							Game Channel
						</Tabs.Trigger>
						<Tabs.Trigger value="search" class="h-8 text-xs">
							Search Query
						</Tabs.Trigger>
						<Tabs.Trigger value="user_channel_query" class="h-8 text-xs">
							User Channel + Query
						</Tabs.Trigger>
						<Tabs.Trigger value="playlist" class="h-8 text-xs">
							Playlist
						</Tabs.Trigger>
					</Tabs.List>

					<Tabs.Content value="game_channel" class="mt-3 space-y-2">
						<Label>Game Channel <span class="text-destructive">*</span></Label>
						{#if newGameChannelId}
							<div class="flex items-center gap-2 rounded-md border px-3 py-2">
								<span class="flex-1 text-sm font-medium"
									>{newGameChannelName}</span
								>
								<span class="font-mono text-xs text-muted-foreground"
									>{newGameChannelId}</span
								>
								<Button
									variant="outline"
									size="sm"
									onclick={() => {
										newGameChannelId = null;
										newGameChannelName = null;
										gameChannelSearchStore.set("");
									}}
								>
									✕
								</Button>
							</div>
						{:else}
							<div class="relative">
								<Input
									placeholder="Search for a game channel…"
									value={$gameChannelSearchStore}
									oninput={(e) =>
										gameChannelSearchStore.set(
											(e.currentTarget as HTMLInputElement).value
										)}
								/>
								{#if $gameChannelSearchQuery.isFetching}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover px-3 py-2 shadow-md"
									>
										<p class="text-xs text-muted-foreground">Searching…</p>
									</div>
								{:else if $gameChannelSearchQuery.data && $gameChannelSearchQuery.data.length > 0}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 divide-y overflow-y-auto rounded-md border bg-popover shadow-md"
									>
										{#each $gameChannelSearchQuery.data as ch (ch.channelId)}
											<button
												type="button"
												class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
												onclick={() => {
													newGameChannelId = ch.channelId;
													newGameChannelName = ch.name;
													gameChannelSearchStore.set("");
												}}
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
								{:else if $gameChannelSearchQuery.data && $gameChannelSearchQuery.data.length === 0 && $gameChannelSearchStore.trim().length >= 2}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover px-3 py-2 shadow-md"
									>
										<p class="text-xs text-muted-foreground">
											No channels found.
										</p>
									</div>
								{/if}
							</div>
						{/if}
						<p class="text-xs text-muted-foreground">
							Discover all uploads from this channel without a keyword filter.
						</p>
					</Tabs.Content>

					<Tabs.Content value="search" class="mt-3 space-y-2">
						<Label for="create-query">
							Search Query <span class="text-destructive">*</span>
						</Label>
						<Input
							id="create-query"
							placeholder="e.g. Starforge Arena playtest feedback"
							bind:value={newSearchQuery}
						/>
						<p class="text-xs text-muted-foreground">
							Run a broad YouTube keyword search.
						</p>
					</Tabs.Content>

					<Tabs.Content value="user_channel_query" class="mt-3 space-y-2">
						<Label>User Channel <span class="text-destructive">*</span></Label>
						{#if newUserChannelId}
							<div class="flex items-center gap-2 rounded-md border px-3 py-2">
								<span class="flex-1 text-sm font-medium"
									>{newUserChannelName}</span
								>
								<span class="font-mono text-xs text-muted-foreground"
									>{newUserChannelId}</span
								>
								<Button
									variant="outline"
									size="sm"
									onclick={() => {
										newUserChannelId = null;
										newUserChannelName = null;
										userChannelSearchStore.set("");
									}}
								>
									✕
								</Button>
							</div>
						{:else}
							<div class="relative">
								<Input
									placeholder="Search for a user channel…"
									value={$userChannelSearchStore}
									oninput={(e) =>
										userChannelSearchStore.set(
											(e.currentTarget as HTMLInputElement).value
										)}
								/>
								{#if $userChannelSearchQuery.isFetching}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover px-3 py-2 shadow-md"
									>
										<p class="text-xs text-muted-foreground">Searching…</p>
									</div>
								{:else if $userChannelSearchQuery.data && $userChannelSearchQuery.data.length > 0}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 divide-y overflow-y-auto rounded-md border bg-popover shadow-md"
									>
										{#each $userChannelSearchQuery.data as ch (ch.channelId)}
											<button
												type="button"
												class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
												onclick={() => {
													newUserChannelId = ch.channelId;
													newUserChannelName = ch.name;
													userChannelSearchStore.set("");
												}}
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
								{:else if $userChannelSearchQuery.data && $userChannelSearchQuery.data.length === 0 && $userChannelSearchStore.trim().length >= 2}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover px-3 py-2 shadow-md"
									>
										<p class="text-xs text-muted-foreground">
											No channels found.
										</p>
									</div>
								{/if}
							</div>
						{/if}
						<div class="space-y-2">
							<Label for="create-user-channel-query">
								Query <span class="text-destructive">*</span>
							</Label>
							<Input
								id="create-user-channel-query"
								placeholder="e.g. patch notes, devlog, playtest"
								bind:value={newUserChannelQuery}
							/>
						</div>
						<p class="text-xs text-muted-foreground">
							Search only inside the selected channel uploads.
						</p>
					</Tabs.Content>

					<Tabs.Content value="playlist" class="mt-3 space-y-2">
						<Label for="create-playlist">
							Playlist URL or ID <span class="text-destructive">*</span>
						</Label>
						<Input
							id="create-playlist"
							placeholder="https://www.youtube.com/playlist?list=PL..."
							bind:value={newPlaylistInput}
						/>
						<p class="text-xs text-muted-foreground">
							Paste a playlist URL or ID (`PL...`, `UU...`, `LL...`, `FL...`,
							`RD...`).
						</p>
					</Tabs.Content>
				</Tabs.Root>
			</div>
			<div class="space-y-2">
				<Label for="create-search-stop">
					Search Stop Words
					<span class="text-xs font-normal text-muted-foreground">
						(search mode only)
					</span>
				</Label>
				<Textarea
					id="create-search-stop"
					placeholder="Comma separated: speedrun, montage, meme, compilation"
					bind:value={newSearchStopWords}
					disabled={createSourceMode !== "search"}
					rows={2}
				/>
				<p class="text-xs text-muted-foreground">
					Appended to the YouTube query as exclusions (`-word`) for broad search
					feeds.
				</p>
			</div>
			<div class="space-y-2">
				<Label for="create-title-stop">Title Stop Words</Label>
				<Textarea
					id="create-title-stop"
					placeholder="Comma separated: speedrun, montage, meme, compilation"
					bind:value={newTitleStopWords}
					rows={2}
				/>
				<p class="text-xs text-muted-foreground">
					Post-fetch filter applied to candidate titles across all source modes.
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
				disabled={!newName.trim() || !newGameTitle.trim() || !isCreateSourceValid() || $createFeedMutation.isPending}
				onclick={() => void handleCreate()}
			>
				{$createFeedMutation.isPending ? "Creating..." : "Create Feed"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- ─── Edit Feed Dialog ───────────────────────────────────────────────────── -->

<Dialog.Root bind:open={editOpen}>
	<Dialog.Content class="flex max-h-[90vh] max-w-lg flex-col">
		<Dialog.Header>
			<Dialog.Title>Edit Feed</Dialog.Title>
			<Dialog.Description>
				Update source mode, filters, and processing settings.
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4 overflow-y-auto pr-1">
			<div class="space-y-2">
				<Label for="edit-name">Feed Name</Label>
				<Input id="edit-name" bind:value={editName} />
			</div>
			<div class="space-y-2">
				<Label>Discovery Source</Label>
				<Tabs.Root bind:value={editSourceMode}>
					<Tabs.List class="grid h-auto w-full grid-cols-2 gap-1">
						<Tabs.Trigger value="game_channel" class="h-8 text-xs">
							Game Channel
						</Tabs.Trigger>
						<Tabs.Trigger value="search" class="h-8 text-xs">
							Search Query
						</Tabs.Trigger>
						<Tabs.Trigger value="user_channel_query" class="h-8 text-xs">
							User Channel + Query
						</Tabs.Trigger>
						<Tabs.Trigger value="playlist" class="h-8 text-xs">
							Playlist
						</Tabs.Trigger>
					</Tabs.List>

					<Tabs.Content value="game_channel" class="mt-3 space-y-2">
						<Label>Game Channel <span class="text-destructive">*</span></Label>
						{#if editGameChannelId}
							<div class="flex items-center gap-2 rounded-md border px-3 py-2">
								<span class="flex-1 text-sm font-medium">
									{editGameChannelName}
								</span>
								<span class="font-mono text-xs text-muted-foreground">
									{editGameChannelId}
								</span>
								<Button
									variant="outline"
									size="sm"
									onclick={() => {
										editGameChannelId = null;
										editGameChannelName = null;
										editGameChannelSearchStore.set("");
									}}
								>
									✕
								</Button>
							</div>
						{:else}
							<div class="relative">
								<Input
									placeholder="Search for a game channel..."
									value={$editGameChannelSearchStore}
									oninput={(e) =>
										editGameChannelSearchStore.set(
											(e.currentTarget as HTMLInputElement).value
										)}
								/>
								{#if $editGameChannelSearchQuery.isFetching}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover px-3 py-2 shadow-md"
									>
										<p class="text-xs text-muted-foreground">Searching...</p>
									</div>
								{:else if $editGameChannelSearchQuery.data && $editGameChannelSearchQuery.data.length > 0}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 divide-y overflow-y-auto rounded-md border bg-popover shadow-md"
									>
										{#each $editGameChannelSearchQuery.data as ch (ch.channelId)}
											<button
												type="button"
												class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
												onclick={() => {
													editGameChannelId = ch.channelId;
													editGameChannelName = ch.name;
													editGameChannelSearchStore.set("");
												}}
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
								{:else if $editGameChannelSearchQuery.data && $editGameChannelSearchQuery.data.length === 0 && $editGameChannelSearchStore.trim().length >= 2}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover px-3 py-2 shadow-md"
									>
										<p class="text-xs text-muted-foreground">
											No channels found.
										</p>
									</div>
								{/if}
							</div>
						{/if}
						<p class="text-xs text-muted-foreground">
							Discover all uploads from this channel without a keyword filter.
						</p>
					</Tabs.Content>

					<Tabs.Content value="search" class="mt-3 space-y-2">
						<Label for="edit-query">
							Search Query <span class="text-destructive">*</span>
						</Label>
						<Input
							id="edit-query"
							placeholder="e.g. Starforge Arena playtest feedback"
							bind:value={editSearchQuery}
						/>
						<p class="text-xs text-muted-foreground">
							Run a broad YouTube keyword search.
						</p>
					</Tabs.Content>

					<Tabs.Content value="user_channel_query" class="mt-3 space-y-2">
						<Label>User Channel <span class="text-destructive">*</span></Label>
						{#if editUserChannelId}
							<div class="flex items-center gap-2 rounded-md border px-3 py-2">
								<span class="flex-1 text-sm font-medium">
									{editUserChannelName}
								</span>
								<span class="font-mono text-xs text-muted-foreground">
									{editUserChannelId}
								</span>
								<Button
									variant="outline"
									size="sm"
									onclick={() => {
										editUserChannelId = null;
										editUserChannelName = null;
										editUserChannelSearchStore.set("");
									}}
								>
									✕
								</Button>
							</div>
						{:else}
							<div class="relative">
								<Input
									placeholder="Search for a user channel..."
									value={$editUserChannelSearchStore}
									oninput={(e) =>
										editUserChannelSearchStore.set(
											(e.currentTarget as HTMLInputElement).value
										)}
								/>
								{#if $editUserChannelSearchQuery.isFetching}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover px-3 py-2 shadow-md"
									>
										<p class="text-xs text-muted-foreground">Searching...</p>
									</div>
								{:else if $editUserChannelSearchQuery.data && $editUserChannelSearchQuery.data.length > 0}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 divide-y overflow-y-auto rounded-md border bg-popover shadow-md"
									>
										{#each $editUserChannelSearchQuery.data as ch (ch.channelId)}
											<button
												type="button"
												class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
												onclick={() => {
													editUserChannelId = ch.channelId;
													editUserChannelName = ch.name;
													editUserChannelSearchStore.set("");
												}}
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
								{:else if $editUserChannelSearchQuery.data && $editUserChannelSearchQuery.data.length === 0 && $editUserChannelSearchStore.trim().length >= 2}
									<div
										class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover px-3 py-2 shadow-md"
									>
										<p class="text-xs text-muted-foreground">
											No channels found.
										</p>
									</div>
								{/if}
							</div>
						{/if}
						<div class="space-y-2">
							<Label for="edit-user-channel-query">
								Query <span class="text-destructive">*</span>
							</Label>
							<Input
								id="edit-user-channel-query"
								placeholder="e.g. patch notes, devlog, playtest"
								bind:value={editUserChannelQuery}
							/>
						</div>
						<p class="text-xs text-muted-foreground">
							Search only inside the selected channel uploads.
						</p>
					</Tabs.Content>

					<Tabs.Content value="playlist" class="mt-3 space-y-2">
						<Label for="edit-playlist">
							Playlist URL or ID <span class="text-destructive">*</span>
						</Label>
						<Input
							id="edit-playlist"
							placeholder="https://www.youtube.com/playlist?list=PL..."
							bind:value={editPlaylistInput}
						/>
						<p class="text-xs text-muted-foreground">
							Paste a playlist URL or ID (`PL...`, `UU...`, `LL...`, `FL...`,
							`RD...`).
						</p>
					</Tabs.Content>
				</Tabs.Root>
			</div>
			<div class="space-y-2">
				<Label for="edit-search-stop">
					Search Stop Words
					<span class="text-xs font-normal text-muted-foreground">
						(search mode only)
					</span>
				</Label>
				<Textarea
					id="edit-search-stop"
					bind:value={editSearchStopWords}
					disabled={editSourceMode !== "search"}
					rows={2}
				/>
				<p class="text-xs text-muted-foreground">
					Appended to the YouTube query as exclusions (`-word`) for broad search
					feeds.
				</p>
			</div>
			<div class="space-y-2">
				<Label for="edit-title-stop">Title Stop Words</Label>
				<Textarea
					id="edit-title-stop"
					bind:value={editTitleStopWords}
					rows={2}
				/>
				<p class="text-xs text-muted-foreground">
					Post-fetch filter applied to candidate titles across all source modes.
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
				disabled={!editName.trim() || !isEditSourceValid() || $updateFeedMutation.isPending}
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
