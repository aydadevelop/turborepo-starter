<script lang="ts">
	import MessageSquarePlus from "@lucide/svelte/icons/message-square-plus";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import { Button } from "@my-app/ui/components/button";
	import {
		createMutation,
		createQuery,
		useQueryClient,
	} from "@tanstack/svelte-query";
	import { setContext } from "svelte";
	import { derived } from "svelte/store";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { assistantClient } from "$lib/assistant";
	import { authClient } from "$lib/auth-client";
	import { queryKeys } from "$lib/query-keys";

	const { children } = $props();

	type SessionData = typeof authClient.$Infer.Session;

	const hasSessionUser = (
		data: SessionData | null | undefined
	): data is NonNullable<SessionData> & {
		session: object;
		user: { id: string };
	} => Boolean(data?.session && data?.user?.id);

	const sessionQuery = authClient.useSession();
	const queryClient = useQueryClient();

	let isSigningIn = $state(false);
	let attemptedAutoSession = $state(false);
	let retryAutoSessionTimer: ReturnType<typeof setTimeout> | null = null;

	async function ensureSession(): Promise<boolean> {
		if (hasSessionUser($sessionQuery.data)) return true;
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
		if ($sessionQuery.isPending) {
			return;
		}

		if (hasSessionUser($sessionQuery.data)) {
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

	const chatsQuery = createQuery(
		derived(sessionQuery, ($session) => ({
			queryKey: queryKeys.assistant.chats,
			queryFn: () => assistantClient.listChats({}),
			enabled: hasSessionUser($session.data),
		}))
	);

	const createChatMutation = createMutation({
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
	});

	const deleteChatMutation = createMutation({
		mutationFn: (chatId: string) => assistantClient.deleteChat({ chatId }),
		onSuccess() {
			queryClient.invalidateQueries({ queryKey: queryKeys.assistant.chats });
			if (page.params.id) {
				goto(resolve("/chat"));
			}
		},
	});

	const activeChatId = $derived(page.params.id);

	setContext("createChatMutation", createChatMutation);
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
							data-testid="delete-chat-button"
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

			{#if !($chatsQuery.isLoading || $chatsQuery.data?.length)}
				<p
					class="px-2 py-4 text-center text-xs text-muted-foreground"
					data-testid="chat-empty-state"
				>
					No chats yet
				</p>
			{/if}
		</nav>
	</aside>

	<div class="flex-1">{@render children()}</div>
</div>
