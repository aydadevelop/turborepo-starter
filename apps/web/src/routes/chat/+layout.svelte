<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import MessageSquarePlus from "@lucide/svelte/icons/message-square-plus";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/stores";
	import { assistantClient } from "$lib/assistant";
	import { authClient } from "$lib/auth-client";

	const { children } = $props();

	const sessionQuery = authClient.useSession();
	const queryClient = useQueryClient();

	let isSigningIn = $state(false);

	async function ensureSession(): Promise<boolean> {
		if ($sessionQuery.data) return true;
		if (isSigningIn) return false;
		isSigningIn = true;
		try {
			await authClient.signIn.anonymous();
			return true;
		} catch {
			return false;
		} finally {
			isSigningIn = false;
		}
	}

	const chatsQuery = createQuery({
		queryKey: ["assistant", "chats"],
		queryFn: () => assistantClient.listChats({}),
		enabled: Boolean($sessionQuery.data),
	});

	const createChatMutation = createMutation({
		async mutationFn(title: string) {
			await ensureSession();
			return assistantClient.createChat({ title });
		},
		onSuccess(data) {
			queryClient.invalidateQueries({ queryKey: ["assistant", "chats"] });
			goto(resolve(`/chat/${data.id}`));
		},
	});

	const deleteChatMutation = createMutation({
		mutationFn: (chatId: string) =>
			assistantClient.deleteChat({ chatId }),
		onSuccess() {
			queryClient.invalidateQueries({ queryKey: ["assistant", "chats"] });
			if ($page.params.id) {
				goto(resolve("/chat"));
			}
		},
	});

	const activeChatId = $derived($page.params.id);
</script>

<div class="flex h-[calc(100svh-4rem)]">
	<aside
		class="flex w-64 shrink-0 flex-col border-r border-border bg-muted/30"
	>
		<div class="flex items-center justify-between border-b border-border p-3">
			<h2 class="text-sm font-semibold">Chats</h2>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				onclick={() => $createChatMutation.mutate("New Chat")}
				disabled={$createChatMutation.isPending}
			>
				<MessageSquarePlus class="h-4 w-4" />
			</Button>
		</div>

		<nav class="flex-1 overflow-y-auto p-2">
			{#if $chatsQuery.data}
				{#each $chatsQuery.data as chat (chat.id)}
					<a
						href={resolve(`/chat/${chat.id}`)}
						class="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition {activeChatId ===
						chat.id
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					>
						<span class="truncate">{chat.title}</span>
						<button
							type="button"
							class="ml-1 hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								$deleteChatMutation.mutate(chat.id);
							}}
						>
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					</a>
				{/each}
			{/if}

			{#if $chatsQuery.isLoading}
				<p class="px-2 py-4 text-center text-xs text-muted-foreground">
					Loading...
				</p>
			{/if}

			{#if $chatsQuery.data?.length === 0}
				<p class="px-2 py-4 text-center text-xs text-muted-foreground">
					No chats yet
				</p>
			{/if}
		</nav>
	</aside>

	<div class="flex-1">
		{@render children()}
	</div>
</div>
