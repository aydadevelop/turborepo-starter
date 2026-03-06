<script lang="ts">
	import {
		Chat,
		ChatContainerContent,
		ChatContainerRoot,
		ChatContainerScrollAnchor,
		Loader,
		Message,
		MessageContent,
		type UIMessage,
	} from "@my-app/ai-chat";
	import { sanitizeTags } from "@my-app/contaktly-widget";
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { createContaktlyWidgetChatTransport } from "$lib/contaktly-chat";
	import { client } from "$lib/orpc";

	type BootstrapState = Awaited<
		ReturnType<typeof client.contaktly.getWidgetBootstrap>
	> | null;

	const configId = $derived(page.url.searchParams.get("params")?.trim() || "");
	const visitorId = $derived(
		page.url.searchParams.get("visitorId")?.trim() || ""
	);
	const widgetInstanceId = $derived(
		page.url.searchParams.get("widgetInstanceId")?.trim() || ""
	);
	const tags = $derived(sanitizeTags(page.url.searchParams.get("tags")));
	const hostOrigin = $derived(
		page.url.searchParams.get("hostOrigin")?.trim() || ""
	);
	const sourceUrl = $derived(
		page.url.searchParams.get("sourceUrl")?.trim() || ""
	);
	const pageTitle = $derived(
		page.url.searchParams.get("pageTitle")?.trim() || ""
	);
	const referrer = $derived(
		page.url.searchParams.get("referrer")?.trim() || ""
	);
	const debugMode = $derived(page.url.searchParams.get("debug") === "1");

	let bootstrap = $state<BootstrapState>(null);
	let chat = $state<Chat<UIMessage> | null>(null);
	let errorMessage = $state("");
	let inputValue = $state("");
	let isSyncingConversation = $state(false);
	let bookingUrl = $state("");
	let conversationId = $state("");
	let stateVersion = $state(0);
	let activePromptKey = $state("");
	let stage = $state<"qualification" | "ready_to_book">("qualification");

	const starterCards = $derived(bootstrap?.starterCards ?? []);

	const toUIMessages = (
		messages: NonNullable<BootstrapState>["messages"]
	): UIMessage[] =>
		messages.map((message) => ({
			id: message.id,
			role: message.role,
			parts: [{ type: "text", text: message.text }],
		}));

	const getMessageText = (message: UIMessage) =>
		message.parts
			.filter(
				(
					part
				): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
					part.type === "text"
			)
			.map((part) => part.text)
			.join("");

	const syncBootstrapState = (data: NonNullable<BootstrapState>) => {
		bootstrap = data;
		bookingUrl = data.bookingUrl;
		conversationId = data.conversationId;
		activePromptKey = data.activePromptKey;
		stateVersion = data.stateVersion;
		stage = data.stage;

		const nextMessages = toUIMessages(data.messages);
		if (!chat || chat.id !== data.conversationId) {
			chat = new Chat({
				id: data.conversationId,
				messages: nextMessages,
				transport: createContaktlyWidgetChatTransport(client.contaktly, () => ({
					configId,
					hostOrigin,
					pageTitle,
					sourceUrl,
					stateVersion,
					tags,
					visitorId,
					widgetInstanceId,
					widgetSessionToken: data.widgetSessionToken,
				})),
				onError: (error) => {
					errorMessage = error.message;
				},
				onFinish: async () => {
					await reloadConversation();
				},
			});
			return;
		}

		chat.messages = nextMessages;
	};

	const loadBootstrap = async () => {
		const data = await client.contaktly.getWidgetBootstrap({
			configId,
			hostOrigin,
			visitorId,
			widgetInstanceId,
			tags,
			sourceUrl,
			pageTitle,
			referrer,
		});

		syncBootstrapState(data);
	};

	const reloadConversation = async () => {
		if (!(configId && visitorId && widgetInstanceId)) {
			return;
		}

		isSyncingConversation = true;

		try {
			errorMessage = "";
			await loadBootstrap();
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: "Unable to reload the widget conversation state.";
		} finally {
			isSyncingConversation = false;
		}
	};

	const sendMessage = async (message: string) => {
		if (
			!(
				chat &&
				message.trim() &&
				chat.status !== "streaming" &&
				!isSyncingConversation
			)
		) {
			return;
		}

		errorMessage = "";
		await chat.sendMessage({ text: message.trim() });
	};

	const handleSubmit = async () => {
		const nextMessage = inputValue;
		inputValue = "";
		await sendMessage(nextMessage);
	};

	onMount(() => {
		if (!(configId && visitorId && widgetInstanceId)) {
			errorMessage = "Missing widget bootstrap query parameters.";
			return;
		}

		reloadConversation();
	});
</script>

<svelte:head> <title>Contaktly Widget Frame</title> </svelte:head>

<div class="min-h-screen bg-transparent p-4">
	<div
		class="mx-auto flex min-h-[660px] max-w-[430px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_35px_80px_rgba(15,23,42,0.18)]"
	>
		<div class="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xs uppercase tracking-[0.25em] text-emerald-300">
						Instant Qualification
					</p>
					<h1 class="mt-2 text-lg font-semibold">
						{bootstrap?.botName ?? "Contaktly"}
					</h1>
					<p class="mt-1 text-sm text-slate-300">
						Ask about fit, timing, or booking availability.
					</p>
				</div>

				{#if debugMode}
					<button
						class="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-emerald-300 hover:text-white"
						onclick={reloadConversation}
						type="button"
					>
						Reload
					</button>
				{/if}
			</div>
		</div>

		{#if errorMessage}
			<div
				class="m-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
			>
				{errorMessage}
			</div>
		{:else if !(bootstrap && chat)}
			<div
				class="flex flex-1 items-center justify-center text-sm text-slate-500"
			>
				Loading widget bootstrap...
			</div>
		{:else}
			<div class="flex flex-1 flex-col bg-slate-50">
				<div class="border-b border-slate-200 px-5 py-4">
					<div class="flex flex-wrap gap-2">
						{#each starterCards as starter}
							<button
								class="rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
								disabled={chat.status === "streaming" || isSyncingConversation}
								onclick={() => sendMessage(starter)}
								type="button"
							>
								{starter}
							</button>
						{/each}
					</div>
				</div>

				<ChatContainerRoot class="flex flex-1 flex-col">
					<ChatContainerContent
						class="flex flex-1 flex-col gap-3 px-5 py-5 min-w-full"
					>
						{#each chat.messages as message (message.id)}
							<Message
								class="flex-col {message.role === 'user'
									? 'items-end'
									: 'items-start'}"
							>
								<MessageContent
									class={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
										message.role === "assistant"
											? "bg-white text-slate-700"
											: "bg-emerald-950 text-emerald-50"
									}`}
								>
									{getMessageText(message)}
								</MessageContent>
							</Message>
						{/each}

						{#if chat.status === "streaming" || isSyncingConversation}
							<Message>
								<MessageContent
									class="max-w-[85%] rounded-2xl bg-white px-4 py-3 text-sm text-slate-400 shadow-sm"
								>
									<Loader variant="dots" size="sm" />
								</MessageContent>
							</Message>
						{/if}

						<ChatContainerScrollAnchor />
					</ChatContainerContent>
				</ChatContainerRoot>

				<div class="border-t border-slate-200 bg-white px-5 py-4">
					<form
						class="space-y-3"
						onsubmit={(event) => {
							event.preventDefault();
							handleSubmit();
						}}
					>
						<label class="block">
							<span class="sr-only">Message</span>
							<textarea
								bind:value={inputValue}
								class="min-h-24 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
								placeholder="Tell me what you want help with..."
							></textarea>
						</label>

						<div class="flex items-center justify-between gap-4">
							<div class="text-xs text-slate-500">
								<p>
									Your answers stay with this browser session so the chat can
									pick up where you left off.
								</p>
							</div>

							<button
								class="rounded-full bg-emerald-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-300"
								disabled={chat.status === "streaming" ||
									isSyncingConversation ||
									!inputValue.trim()}
								type="submit"
							>
								Send
							</button>
						</div>
					</form>

					{#if stage === "ready_to_book" && bookingUrl}
						<div
							class="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
						>
							<p class="text-sm font-medium text-emerald-900">
								Qualified. Book the strategy call now.
							</p>
							<a
								class="mt-3 inline-flex rounded-full bg-emerald-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-900"
								href={bookingUrl}
								rel="noreferrer"
								target="_blank"
							>
								Open booking
							</a>
						</div>
					{/if}

					{#if debugMode}
						<div
							class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500"
						>
							<p>
								<span class="font-medium text-slate-900">conversation</span>:
								{conversationId}
							</p>
							<p>
								<span class="font-medium text-slate-900">state version</span>:
								{stateVersion}
							</p>
							<p>
								<span class="font-medium text-slate-900">active prompt</span>:
								{activePromptKey}
							</p>
							<p>
								<span class="font-medium text-slate-900">stage</span>:{stage}
							</p>
							<p>
								<span class="font-medium text-slate-900">config</span>:
								{bootstrap.configId}
							</p>
							<p>
								<span class="font-medium text-slate-900">visitor</span>:
								{bootstrap.visitorId}
							</p>
							<p>
								<span class="font-medium text-slate-900">instance</span>:
								{bootstrap.widgetInstanceId}
							</p>
							<p>
								<span class="font-medium text-slate-900">session</span>:
								{bootstrap.widgetSessionToken}
							</p>
							<p>
								<span class="font-medium text-slate-900">tags</span>:
								{bootstrap.pageContext.tags.join(", ") || "none"}
							</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
