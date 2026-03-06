<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import * as Card from "@my-app/ui/components/card";
	import { createQuery } from "@tanstack/svelte-query";
	import { orpc } from "$lib/orpc";

	type SortKey = "qualified" | "recent" | "visitor";

	const conversationsQuery = createQuery(() => ({
		...orpc.contaktly.listConversations.queryOptions({
			input: {},
		}),
		refetchInterval: 5000,
		refetchIntervalInBackground: true,
	}));

	let selectedConversationId = $state("");
	let sortBy = $state<SortKey>("recent");

	const conversations = $derived(conversationsQuery.data ?? []);
	const sortedConversations = $derived.by(() => {
		const items = [...conversations];

		switch (sortBy) {
			case "qualified":
				return items.sort((left, right) => {
					if (left.stage === right.stage) {
						return right.updatedAt.localeCompare(left.updatedAt);
					}

					return left.stage === "ready_to_book" ? -1 : 1;
				});
			case "visitor":
				return items.sort((left, right) =>
					left.visitorId.localeCompare(right.visitorId)
				);
			default:
				return items.sort((left, right) =>
					right.updatedAt.localeCompare(left.updatedAt)
				);
		}
	});
	const selectedConversation = $derived(
		sortedConversations.find(
			(conversation) => conversation.conversationId === selectedConversationId
		) ?? sortedConversations[0]
	);

	$effect(() => {
		if (!selectedConversationId && sortedConversations[0]) {
			selectedConversationId = sortedConversations[0].conversationId;
			return;
		}

		if (
			selectedConversationId &&
			!sortedConversations.some(
				(conversation) => conversation.conversationId === selectedConversationId
			)
		) {
			selectedConversationId = sortedConversations[0]?.conversationId ?? "";
		}
	});

	const formatUpdatedAt = (value: string) =>
		new Date(value).toLocaleString(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		});

	const slotEntries = (slots: Record<string, string>) =>
		Object.entries(slots).filter(([, value]) => value.trim().length > 0);
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
	<div class="space-y-2">
		<p class="text-sm uppercase tracking-[0.3em] text-primary">Contaktly</p>
		<h1 class="text-3xl font-semibold tracking-tight">Conversations</h1>
		<p class="max-w-3xl text-muted-foreground">
			Customer conversations are grouped by the active organization and refresh
			automatically. The customer chat remains streamed; this dashboard polls on
			a short interval so operators can sort and inspect live threads.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
		<Card.Root>
			<Card.Header class="space-y-3">
				<div class="flex items-center justify-between gap-3">
					<div>
						<Card.Title>Active Threads</Card.Title>
						<Card.Description>
							Sorted inside the current organization
						</Card.Description>
					</div>
					<Badge variant="outline">{conversations.length} total</Badge>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each [
						{ key: "recent", label: "Recent" },
						{ key: "qualified", label: "Qualified first" },
						{ key: "visitor", label: "Visitor" },
					] as option}
						<button
							class={`rounded-full border px-3 py-1 text-sm transition ${
								sortBy === option.key
									? "border-primary bg-primary text-primary-foreground"
									: "border-border bg-background text-foreground"
							}`}
							data-testid={`contaktly-sort-${option.key}`}
							onclick={() => {
								sortBy = option.key as SortKey;
							}}
							type="button"
						>
							{option.label}
						</button>
					{/each}
				</div>
			</Card.Header>
			<Card.Content
				class="space-y-3"
				data-testid="contaktly-conversations-list"
			>
				{#if conversationsQuery.isLoading}
					<p class="text-sm text-muted-foreground">Loading conversations...</p>
				{:else if sortedConversations.length === 0}
					<p class="text-sm text-muted-foreground">
						No customer conversations for this organization yet.
					</p>
				{:else}
					{#each sortedConversations as conversation}
						<button
							class={`w-full rounded-2xl border p-4 text-left transition ${
								selectedConversation?.conversationId ===
								conversation.conversationId
									? "border-primary bg-primary/5"
									: "border-border bg-background hover:border-primary/40"
							}`}
							data-testid={`contaktly-conversation-row-${conversation.conversationId}`}
							onclick={() => {
								selectedConversationId = conversation.conversationId;
							}}
							type="button"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="space-y-1">
									<p class="font-medium">{conversation.visitorId}</p>
									<p class="text-xs text-muted-foreground">
										{conversation.configId}
									</p>
								</div>
								<Badge
									data-testid={`contaktly-conversation-status-${conversation.stage}`}
									variant={conversation.stage === "ready_to_book"
											? "default"
											: "secondary"}
								>
									{conversation.stage}
								</Badge>
							</div>
							<p class="mt-3 line-clamp-2 text-sm text-muted-foreground">
								{conversation.lastMessageText ?? "No messages yet"}
							</p>
							<p class="mt-3 text-xs text-muted-foreground">
								Updated {formatUpdatedAt(conversation.updatedAt)}
							</p>
						</button>
					{/each}
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Thread Detail</Card.Title>
				<Card.Description>
					Latest customer conversation for the selected thread
				</Card.Description>
			</Card.Header>
			<Card.Content
				class="space-y-5"
				data-testid="contaktly-conversation-thread"
			>
				{#if !selectedConversation}
					<p class="text-sm text-muted-foreground">
						Select a conversation to inspect the thread.
					</p>
				{:else}
					<div class="grid gap-3 md:grid-cols-2">
						<div class="rounded-2xl border border-border/70 bg-muted/30 p-4">
							<p
								class="text-xs uppercase tracking-[0.2em] text-muted-foreground"
							>
								Lead
							</p>
							<p class="mt-2 text-sm">
								<strong>visitor:</strong> {selectedConversation.visitorId}
							</p>
							<p class="mt-1 text-sm">
								<strong>config:</strong> {selectedConversation.configId}
							</p>
							<p class="mt-1 text-sm">
								<strong>updated:</strong>
								{formatUpdatedAt(selectedConversation.updatedAt)}
							</p>
						</div>

						<div class="rounded-2xl border border-border/70 bg-muted/30 p-4">
							<p
								class="text-xs uppercase tracking-[0.2em] text-muted-foreground"
							>
								Qualification
							</p>
							<div class="mt-2 flex flex-wrap gap-2">
								<Badge variant="secondary"
									>{selectedConversation.lastIntent}</Badge
								>
								<Badge variant="outline"
									>{selectedConversation.activePromptKey}</Badge
								>
								<Badge
									variant={selectedConversation.stage === "ready_to_book"
											? "default"
											: "secondary"}
								>
									{selectedConversation.stage}
								</Badge>
							</div>
							<div class="mt-3 space-y-1 text-sm text-muted-foreground">
								{#if slotEntries(selectedConversation.slots).length === 0}
									<p>No qualification slots captured yet.</p>
								{:else}
									{#each slotEntries(selectedConversation.slots) as [ key, value ]}
										<p><strong>{key}:</strong> {value}</p>
									{/each}
								{/if}
							</div>
						</div>
					</div>

					<div class="space-y-3">
						{#each selectedConversation.messages as message}
							<div
								class={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
									message.role === "assistant"
										? "bg-muted text-foreground"
										: "ml-auto bg-primary text-primary-foreground"
								}`}
							>
								<p>{message.text}</p>
							</div>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
