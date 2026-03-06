import type { UIMessage } from "@my-app/ai-chat";
import { eventIteratorToUnproxiedDataStream } from "@orpc/client";
import type { ChatTransport } from "ai";

type WidgetChatProcedure = (
	input: {
		configId: string;
		clientTurnId: string;
		hostOrigin: string;
		messageId?: string;
		messages: UIMessage[];
		pageTitle: string;
		sourceUrl: string;
		stateVersion: number;
		tags: string[];
		visitorId: string;
		widgetInstanceId: string;
		widgetSessionToken: string;
	},
	options?: { signal?: AbortSignal }
) => Promise<AsyncIterable<unknown>>;

export function createContaktlyWidgetChatTransport(
	client: { streamWidgetChat: WidgetChatProcedure },
	getContext: () => {
		configId: string;
		hostOrigin: string;
		pageTitle: string;
		sourceUrl: string;
		stateVersion: number;
		tags: string[];
		visitorId: string;
		widgetInstanceId: string;
		widgetSessionToken: string;
	}
): ChatTransport<UIMessage> {
	return {
		async sendMessages(options) {
			const context = getContext();
			const iterator = await client.streamWidgetChat(
				{
					...context,
					clientTurnId: crypto.randomUUID(),
					messageId: options.messageId,
					messages: options.messages,
				},
				{ signal: options.abortSignal }
			);

			return eventIteratorToUnproxiedDataStream(
				iterator as AsyncIterableIterator<unknown>
			) as ReadableStream<never>;
		},
		reconnectToStream() {
			return Promise.resolve(null);
		},
	};
}
