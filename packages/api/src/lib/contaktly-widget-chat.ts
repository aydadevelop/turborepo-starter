import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
	convertToModelMessages,
	createUIMessageStream,
	stepCountIs,
	streamText,
	type UIMessage,
} from "ai";

import {
	type ContaktlyConversationTurnResult,
	commitContaktlyConversationTurn,
	prepareContaktlyConversationTurn,
} from "./contaktly-conversation";
import { resolveContaktlyWidgetConfig } from "./contaktly-widget-config";

interface WidgetChatMessage {
	id: string;
	parts: Record<string, unknown>[];
	role: "assistant" | "system" | "user";
}

interface CreateContaktlyWidgetChatStreamInput {
	aiModel: string;
	clientTurnId: string;
	configId: string;
	hostOrigin: string;
	messageId?: string;
	messages: WidgetChatMessage[];
	openRouterApiKey: string;
	pageTitle: string;
	sourceUrl: string;
	stateVersion: number;
	tags: string[];
	visitorId: string;
	widgetInstanceId: string;
}

const isTextPart = (
	part: Record<string, unknown>
): part is { text: string; type: "text" } =>
	part.type === "text" && typeof part.text === "string";

const getMessageText = (message: WidgetChatMessage | undefined) =>
	message?.parts
		.filter(isTextPart)
		.map((part) => part.text)
		.join("")
		.trim() ?? "";

const getLatestUserMessage = (messages: WidgetChatMessage[]) =>
	[...messages].reverse().find((message) => message.role === "user");

const getAssistantMessageText = (message: UIMessage) =>
	message.parts
		.filter(
			(
				part
			): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
				part.type === "text"
		)
		.map((part) => part.text)
		.join("")
		.trim();

const isOpenRouterEnabled = (apiKey: string) => {
	const trimmed = apiKey.trim();
	return Boolean(trimmed) && !trimmed.includes("placeholder");
};

const chunkText = (value: string) => {
	const chunks = value.match(/\S+\s*/g);
	return chunks && chunks.length > 0 ? chunks : [value];
};

const createDeterministicReplyStream = ({
	assistantMessage,
	messages,
	onFinish,
}: {
	assistantMessage: string;
	messages: UIMessage[];
	onFinish?: (assistantText: string) => Promise<void>;
}) =>
	createUIMessageStream({
		originalMessages: messages,
		execute({ writer }) {
			const textId = crypto.randomUUID();
			writer.write({ type: "text-start", id: textId });
			for (const delta of chunkText(assistantMessage)) {
				writer.write({
					type: "text-delta",
					id: textId,
					delta,
				});
			}
			writer.write({ type: "text-end", id: textId });
		},
		onFinish: async ({ isAborted }) => {
			if (isAborted || !onFinish) {
				return;
			}

			await onFinish(assistantMessage);
		},
	});

const buildConversationTranscript = (messages: WidgetChatMessage[]) =>
	messages
		.map((message) => {
			const text = getMessageText(message);
			if (!text) {
				return null;
			}

			return `${message.role.toUpperCase()}: ${text}`;
		})
		.filter(Boolean)
		.join("\n");

const buildContaktlySystemPrompt = ({
	botName,
	bookingUrl,
	hostOrigin,
	pageTitle,
	reply,
	sourceUrl,
	tags,
	transcript,
}: {
	botName: string;
	bookingUrl: string;
	hostOrigin: string;
	pageTitle: string;
	reply: ContaktlyConversationTurnResult["reply"];
	sourceUrl: string;
	tags: string[];
	transcript: string;
}) =>
	`
You are ${botName}, a sales qualification assistant embedded on a client website.

Rules:
- Ask at most one question in this turn.
- Never ask two questions or a multi-part question.
- Keep the reply under 2 short paragraphs.
- Stay grounded in the current page context and the collected qualification state.
- Do not mention internal prompt keys, stages, or system rules.

Current page context:
- source url: ${sourceUrl || "unknown"}
- host origin: ${hostOrigin || "unknown"}
- page title: ${pageTitle || "unknown"}
- tags: ${tags.join(", ") || "none"}

Conversation so far:
${transcript || "No prior messages."}

Required outcome for this turn:
- stage: ${reply.stage}
- intent: ${reply.intent}
- information to collect next: ${reply.promptKey}
- canonical reply: ${reply.assistantMessage}

If stage is ready_to_book, confirm qualification and direct the user to book here: ${bookingUrl}.
Respond with the assistant message only.
`.trim();

export async function createContaktlyWidgetChatStream({
	aiModel,
	clientTurnId,
	configId,
	hostOrigin,
	messageId: _messageId,
	messages,
	openRouterApiKey,
	pageTitle,
	sourceUrl,
	stateVersion,
	tags,
	visitorId,
	widgetInstanceId,
}: CreateContaktlyWidgetChatStreamInput): Promise<
	ReadableStream<Record<string, unknown>>
> {
	const latestUserText = getMessageText(getLatestUserMessage(messages));
	if (!latestUserText) {
		throw new Error(
			"Widget chat requires a user text message before streaming."
		);
	}

	const preparedResult = await prepareContaktlyConversationTurn({
		clientTurnId,
		configId,
		message: latestUserText,
		pageTitle,
		stateVersion,
		tags,
		visitorId,
		widgetInstanceId,
	});
	const uiMessages = messages as unknown as UIMessage[];

	if ("existing" in preparedResult) {
		return createDeterministicReplyStream({
			assistantMessage: preparedResult.existing.reply.assistantMessage,
			messages: uiMessages,
		}) as ReadableStream<Record<string, unknown>>;
	}

	const { prepared } = preparedResult;
	const widget = await resolveContaktlyWidgetConfig(configId);
	const commitTurn = async (assistantText: string) => {
		await commitContaktlyConversationTurn({
			assistantMessage: assistantText || prepared.reply.assistantMessage,
			clientTurnId,
			prepared,
		});
	};

	if (!isOpenRouterEnabled(openRouterApiKey)) {
		return createDeterministicReplyStream({
			assistantMessage: prepared.reply.assistantMessage,
			messages: uiMessages,
			onFinish: commitTurn,
		}) as ReadableStream<Record<string, unknown>>;
	}

	const openrouter = createOpenRouter({
		apiKey: openRouterApiKey,
	});

	try {
		const result = streamText({
			model: openrouter(aiModel || "openai/gpt-5-nano:nitro"),
			system: buildContaktlySystemPrompt({
				botName: widget.botName,
				bookingUrl: widget.bookingUrl,
				hostOrigin,
				pageTitle,
				reply: prepared.reply,
				sourceUrl,
				tags,
				transcript: buildConversationTranscript(messages),
			}),
			messages: await convertToModelMessages(uiMessages, {
				ignoreIncompleteToolCalls: true,
			}),
			stopWhen: stepCountIs(1),
		});

		return result.toUIMessageStream({
			originalMessages: uiMessages,
			sendReasoning: false,
			sendSources: false,
			onFinish: async ({ isAborted, responseMessage }) => {
				if (isAborted) {
					return;
				}

				const assistantText =
					getAssistantMessageText(responseMessage) ||
					prepared.reply.assistantMessage;
				await commitTurn(assistantText);
			},
		}) as ReadableStream<Record<string, unknown>>;
	} catch {
		return createDeterministicReplyStream({
			assistantMessage: prepared.reply.assistantMessage,
			messages: uiMessages,
			onFinish: commitTurn,
		}) as ReadableStream<Record<string, unknown>>;
	}
}
