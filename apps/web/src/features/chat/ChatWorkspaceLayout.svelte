<script lang="ts">
	import MessageSquarePlus from "@lucide/svelte/icons/message-square-plus";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import { Button } from "@my-app/ui/components/button";
	import {
		createMutation,
		createQuery,
		useQueryClient,
	} from "@tanstack/svelte-query";
	import { type Snippet, setContext } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { assistantClient } from "$lib/assistant";
	import { authClient } from "$lib/auth-client";
	import {
		getPageInitialSessionData,
		hasSessionUser,
		isSessionPending,
		resolveSessionData,
	} from "$lib/auth-session";
	import { queryKeys } from "$lib/query-keys";

	let { children }: { children?: Snippet } = $props();

	const sessionQuery = authClient.useSession();
	const initialSession = $derived(getPageInitialSessionData(page.data));
	const sessionData = $derived(
		resolveSessionData($sessionQuery, initialSession)
	);
	const sessionPending = $derived(
		isSessionPending($sessionQuery, initialSession)
	);
	const queryClient = useQueryClient();

	let isSigningIn = $state(false);
	let attemptedAutoSession = $state(false);
	let retryAutoSessionTimer: ReturnType<typeof setTimeout> | null = null;

	async function ensureSession(): Promise<boolean> {
		if (hasSessionUser(sessionData)) return true;
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

	$effect(() => {
		return () => {
			if (retryAutoSessionTimer) {
				clearTimeout(retryAutoSessionTimer);
			}
		};
	});

	$effect(() => {
		if (sessionPending) {
			return;
		}

		if (hasSessionUser(sessionData)) {
			attemptedAutoSession = false;
			return;
		}

		if (attemptedAutoSession || isSigningIn) {
			return;
		}

		attemptedAutoSession = true;
		ensureSession()
			.then((success) => {
				if (success) {
					return;
				}
				if (retryAutoSessionTimer) {
					clearTimeout(retryAutoSessionTimer);
				}
				retryAutoSessionTimer = setTimeout(() => {
					attemptedAutoSession = false;
				}, 3000);
			})
			.catch(() => undefined);
	});

	const chatsQuery = createQuery(() => ({
		queryKey: queryKeys.assistant.chats,
		queryFn: () => assistantClient.listChats({}),
		enabled: hasSessionUser(sessionData),
	}));

	const createChat = createMutation(() => ({
		async mutationFn(title: string) {
			const hasSession = await ensureSession();
			if (!hasSession) {
				throw new Error("Unable to create chat without an active session");
			}
			return assistantClient.createChat({ title });
		},
		onSuccess(data) {
			queryClient.invalidateQueries({ queryKey: queryKeys.assistant.chats });
			goto(resolve(`/chat/${data.id}`));
		},
	}));

	const deleteChat = createMutation(() => ({
		mutationFn: (chatId: string) => assistantClient.deleteChat({ chatId }),
		onSuccess() {
			queryClient.invalidateQueries({ queryKey: queryKeys.assistant.chats });
			if (page.params.id) {
				goto(resolve("/chat"));
			}
		},
	}));

	const activeChatId = $derived(page.params.id);

	setContext("createChatMutation", createChat);
</script>

<div class="flex h-[calc(100svh-6rem)]">
	<aside class="flex w-64 shrink-0 flex-col border-r border-border bg-muted/30">
		<div class="flex items-center justify-between border-b border-border p-3">
			<h2 class="text-sm font-semibold">Chats</h2>
			<Button
				data-testid="new-chat-button-sidebar"
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				onclick={() => createChat.mutate("New Chat")}
				disabled={createChat.isPending}
			>
				<MessageSquarePlus class="h-4 w-4" />
			</Button>
		</div>

		<nav class="flex-1 overflow-y-auto p-2">
			{#if chatsQuery.data}
				{#each chatsQuery.data as chat (chat.id)}
					<a
						href={resolve(`/chat/${chat.id}`)}
						class="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition {activeChatId ===
						chat.id
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					>
						<span class="truncate">{chat.title}</span>
						<button
							data-testid="delete-chat-button"
							type="button"
							class="ml-1 hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								deleteChat.mutate(chat.id);
							}}
						>
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					</a>
				{/each}
			{/if}

			{#if chatsQuery.isLoading}
				<p class="px-2 py-4 text-center text-xs text-muted-foreground">
					Loading...
				</p>
			{/if}

			{#if !(chatsQuery.isLoading || chatsQuery.data?.length)}
				<p
					class="px-2 py-4 text-center text-xs text-muted-foreground"
					data-testid="chat-empty-state"
				>
					No chats yet
				</p>
			{/if}
		</nav>
	</aside>

	<div class="flex-1">{@render children?.()}</div>
</div>
