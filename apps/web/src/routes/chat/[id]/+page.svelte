<script lang="ts">
	import {
		Chat,
		ChatContainerContent,
		ChatContainerRoot,
		ChatContainerScrollAnchor,
		Loader,
		Message,
		MessageContent,
		PromptInput,
		PromptInputAction,
		PromptInputActions,
		PromptInputTextarea,
		ToolComposed,
	} from "@full-stack-cf-app/ai-chat";
	import { createORPCChatTransport } from "@full-stack-cf-app/assistant/transport";
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import ArrowUp from "@lucide/svelte/icons/arrow-up";
	import Square from "@lucide/svelte/icons/square";
	import { createQuery } from "@tanstack/svelte-query";
	import { isToolUIPart } from "ai";
	import type { UIMessage } from "ai";
	import { page } from "$app/stores";
	import { assistantClient } from "$lib/assistant";

	const chatId = $derived($page.params.id!);

	const chatQuery = createQuery({
		get queryKey() { return ["assistant", "chat", chatId] },
		queryFn: () => assistantClient.getChat({ chatId }),
		get enabled() { return Boolean(chatId) },
	});

	let chat = $state<Chat | null>(null);

	// Initialize or switch chat when chatId/data changes
	$effect(() => {
		const currentId = chatId;
		const loading = $chatQuery.isLoading;
		const data = $chatQuery.data;

		if (loading || !data) {
			// Reset while loading a different chat
			if (chat?.id !== currentId) {
				chat = null;
			}
			return;
		}

		if (chat?.id !== currentId) {
			const messages = (data.messages as UIMessage[]) ?? [];
			chat = new Chat({
				id: currentId,
				messages,
				transport: createORPCChatTransport(assistantClient, currentId),
			});
		}
	});

	let inputValue = $state("");

	function handleSubmit() {
		if (!inputValue.trim() || !chat) return;
		chat.sendMessage({ text: inputValue });
		inputValue = "";
	}
</script>

{#if !chat || $chatQuery.isLoading}
	<div class="flex h-full items-center justify-center">
		<Loader variant="dots" size="md" />
	</div>
{:else}
	<div class="mx-auto flex h-full max-w-3xl flex-col p-4">
		<ChatContainerRoot class="flex-1">
			<ChatContainerContent class="space-y-4 p-4 min-w-full">
				{#each chat.messages as message (message.id)}
					{@const textContent = message.parts
						.filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
						.map((p) => p.text)
						.join("")}
					{@const toolParts = message.parts.filter(isToolUIPart)}
					<Message
						class="flex-col {message.role === 'user'
							? 'items-end'
							: 'items-start'}"
					>
						{#if message.role === "assistant"}
							{#if textContent}
								<MessageContent
									markdown
									content={textContent}
									class="bg-secondary max-w-[80%]"
								/>
							{/if}
							{#if toolParts.length > 0}
								<div class="flex max-w-[80%] flex-col gap-2">
									{#each toolParts as part}
										<ToolComposed
											toolPart={{
												type: part.type,
												state: part.state,
												input: part.input as
													| Record<string, unknown>
													| undefined,
												output:
													"output" in part
														? (part.output as Record<string, unknown>)
														: undefined,
												toolCallId: part.toolCallId,
											}}
										/>
									{/each}
								</div>
							{/if}
						{:else}
							<MessageContent class="bg-primary text-primary-foreground max-w-[80%]">
								{textContent}
							</MessageContent>
						{/if}
					</Message>
				{/each}

				{#if chat.status === "streaming"}
					<Message>
						<MessageContent class="bg-secondary max-w-[80%]">
							<Loader variant="dots" size="sm" />
						</MessageContent>
					</Message>
				{/if}

				<ChatContainerScrollAnchor />
			</ChatContainerContent>
		</ChatContainerRoot>

		<div class="border-t pt-4">
			<PromptInput
				value={inputValue}
				onValueChange={(v) => (inputValue = v)}
				onSubmit={handleSubmit}
				isLoading={chat.status === "streaming"}
			>
				<PromptInputTextarea
					placeholder="Ask about boats, availability, or pricing..."
				/>
				<PromptInputActions>
					<PromptInputAction>
						{#snippet tooltip()}
							{chat?.status === "streaming" ? "Stop" : "Send message"}
						{/snippet}
						{#snippet children()}
							{#if chat?.status === "streaming"}
								<Button
									variant="default"
									size="icon"
									class="h-8 w-8 rounded-full"
									onclick={() => chat?.stop()}
								>
									<Square class="h-4 w-4 fill-current" />
								</Button>
							{:else}
								<Button
									variant="default"
									size="icon"
									class="h-8 w-8 rounded-full"
									disabled={!inputValue.trim()}
									onclick={handleSubmit}
								>
									<ArrowUp class="h-4 w-4" />
								</Button>
							{/if}
						{/snippet}
					</PromptInputAction>
				</PromptInputActions>
			</PromptInput>
		</div>
	</div>
{/if}
