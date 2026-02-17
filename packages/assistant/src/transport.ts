import { eventIteratorToUnproxiedDataStream } from "@orpc/client";
import type { ChatTransport, UIMessage } from "ai";

// biome-ignore lint/suspicious/noExplicitAny: oRPC ProcedureClient has complex generics
type ChatProcedure = (...args: any[]) => Promise<AsyncIterable<unknown>>;

export function createORPCChatTransport(
	client: { chat: ChatProcedure },
	chatId: string
): ChatTransport<UIMessage> {
	return {
		async sendMessages(options) {
			const iterator = await client.chat(
				{ chatId, messages: options.messages },
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
