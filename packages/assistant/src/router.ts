import { db } from "@my-app/db";
import { assistantChat, assistantMessage } from "@my-app/db/schema/assistant";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { implement, ORPCError, streamToEventIterator } from "@orpc/server";
import {
	convertToModelMessages,
	stepCountIs,
	streamText,
	type UIMessage,
} from "ai";
import { desc, eq } from "drizzle-orm";

import type { AssistantContext } from "./context";
import { assistantContract } from "./contract";
import { createSystemPrompt } from "./system-prompt";
import { createAssistantTools } from "./tools";

const o = implement(assistantContract).$context<AssistantContext>();

/** Fix legacy tool-invocation parts that were stored without proper state. */
function sanitizeParts(parts: unknown[]): UIMessage["parts"] {
	return (parts as UIMessage["parts"]).map((part) => {
		if (
			"type" in part &&
			typeof part.type === "string" &&
			part.type.startsWith("tool-")
		) {
			const p = part as Record<string, unknown>;
			// Fix legacy 'tool-invocation' type to proper 'tool-<name>' format
			const fixedType =
				part.type === "tool-invocation" && p.toolName
					? `tool-${p.toolName}`
					: part.type;
			// Fix legacy states (call/result from pre-v6 or missing state)
			if (!p.state || p.state === "call" || p.state === "partial-call") {
				return {
					...part,
					type: fixedType,
					state: "input-available" as const,
					input: p.args ?? p.input,
					toolCallId: p.toolCallId as string,
				};
			}
			if (p.state === "result") {
				return {
					...part,
					type: fixedType,
					state: "output-available" as const,
					input: p.args ?? p.input,
					output: p.result ?? p.output,
					toolCallId: p.toolCallId as string,
				};
			}
			// Fix type even if state is correct
			if (fixedType !== part.type) {
				return { ...part, type: fixedType };
			}
		}
		return part;
	}) as UIMessage["parts"];
}

const requireAuth = o.middleware(({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next();
});

const authenticatedProcedure = o.use(requireAuth);

const requireUserId = (context: AssistantContext): string => {
	const userId = context.session?.user?.id;
	if (!userId) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return userId;
};

export const assistantRouter = o.router({
	chat: authenticatedProcedure.chat.handler(async ({ input, context }) => {
		const userId = requireUserId(context);

		// Verify ownership
		const existing = await db
			.select({ id: assistantChat.id, userId: assistantChat.userId })
			.from(assistantChat)
			.where(eq(assistantChat.id, input.chatId))
			.limit(1)
			.then((rows) => rows[0]);

		if (!existing || existing.userId !== userId) {
			throw new ORPCError("NOT_FOUND", {
				message: "Chat not found",
			});
		}

		// Save the latest user message before streaming
		const lastUserMessage = input.messages.at(-1);
		if (lastUserMessage?.role === "user") {
			await db
				.insert(assistantMessage)
				.values({
					id: lastUserMessage.id,
					chatId: input.chatId,
					role: "user",
					parts: lastUserMessage.parts as unknown[],
				})
				.onConflictDoNothing();
		}

		const openrouter = createOpenRouter({
			apiKey: context.openRouterApiKey,
		});
		const tools = createAssistantTools(context.serverClient);

		const result = streamText({
			model: openrouter(context.aiModel || "openai/gpt-5-nano:nitro"),
			system: createSystemPrompt(),
			messages: await convertToModelMessages(
				input.messages as unknown as UIMessage[],
				{ ignoreIncompleteToolCalls: true }
			),
			tools,
			stopWhen: stepCountIs(10),
			async onFinish({ steps }) {
				// Build assistant parts from the completed response
				const parts: unknown[] = [];

				for (const step of steps) {
					if (step.text) {
						parts.push({ type: "text", text: step.text });
					}

					// Build a map of tool results by toolCallId
					const resultMap = new Map<string, unknown>();
					for (const tr of step.toolResults) {
						resultMap.set(tr.toolCallId, tr.output);
					}

					for (const tc of step.toolCalls) {
						if (resultMap.has(tc.toolCallId)) {
							parts.push({
								type: `tool-${tc.toolName}`,
								toolCallId: tc.toolCallId,
								state: "output-available",
								input: tc.input,
								output: resultMap.get(tc.toolCallId),
							});
						} else {
							parts.push({
								type: `tool-${tc.toolName}`,
								toolCallId: tc.toolCallId,
								state: "input-available",
								input: tc.input,
							});
						}
					}
				}

				if (parts.length > 0) {
					await db
						.insert(assistantMessage)
						.values({
							id: crypto.randomUUID(),
							chatId: input.chatId,
							role: "assistant",
							parts,
						})
						.onConflictDoNothing();
				}
			},
		});

		return streamToEventIterator(result.toUIMessageStream());
	}),

	createChat: authenticatedProcedure.createChat.handler(
		async ({ input, context }) => {
			const userId = requireUserId(context);
			const id = crypto.randomUUID();

			await db.insert(assistantChat).values({
				id,
				title: input.title,
				userId,
			});

			return { id, title: input.title };
		}
	),

	listChats: authenticatedProcedure.listChats.handler(async ({ context }) => {
		const userId = requireUserId(context);

		const rows = await db
			.select({
				id: assistantChat.id,
				title: assistantChat.title,
				createdAt: assistantChat.createdAt,
				updatedAt: assistantChat.updatedAt,
			})
			.from(assistantChat)
			.where(eq(assistantChat.userId, userId))
			.orderBy(desc(assistantChat.updatedAt));

		return rows.map((r) => ({
			...r,
			createdAt: r.createdAt.toISOString(),
			updatedAt: r.updatedAt.toISOString(),
		}));
	}),

	getChat: authenticatedProcedure.getChat.handler(
		async ({ input, context }) => {
			const userId = requireUserId(context);

			const chatRecord = await db
				.select()
				.from(assistantChat)
				.where(eq(assistantChat.id, input.chatId))
				.limit(1)
				.then((rows) => rows[0]);

			if (!chatRecord || chatRecord.userId !== userId) {
				throw new ORPCError("NOT_FOUND", {
					message: "Chat not found",
				});
			}

			const messages = await db
				.select()
				.from(assistantMessage)
				.where(eq(assistantMessage.chatId, input.chatId))
				.orderBy(assistantMessage.createdAt);

			return {
				id: chatRecord.id,
				title: chatRecord.title,
				userId: chatRecord.userId,
				createdAt: chatRecord.createdAt.toISOString(),
				updatedAt: chatRecord.updatedAt.toISOString(),
				messages: messages.map((m) => ({
					id: m.id,
					role: m.role as UIMessage["role"],
					parts: sanitizeParts(
						m.parts as UIMessage["parts"]
					) as unknown as Record<string, unknown>[],
					createdAt: m.createdAt.toISOString(),
				})),
			};
		}
	),

	deleteChat: authenticatedProcedure.deleteChat.handler(
		async ({ input, context }) => {
			const userId = requireUserId(context);

			const chatRecord = await db
				.select({ id: assistantChat.id, userId: assistantChat.userId })
				.from(assistantChat)
				.where(eq(assistantChat.id, input.chatId))
				.limit(1)
				.then((rows) => rows[0]);

			if (!chatRecord || chatRecord.userId !== userId) {
				throw new ORPCError("NOT_FOUND", {
					message: "Chat not found",
				});
			}

			await db.delete(assistantChat).where(eq(assistantChat.id, input.chatId));

			return { success: true };
		}
	),

	updateChatTitle: authenticatedProcedure.updateChatTitle.handler(
		async ({ input, context }) => {
			const userId = requireUserId(context);

			const chatRecord = await db
				.select({ id: assistantChat.id, userId: assistantChat.userId })
				.from(assistantChat)
				.where(eq(assistantChat.id, input.chatId))
				.limit(1)
				.then((rows) => rows[0]);

			if (!chatRecord || chatRecord.userId !== userId) {
				throw new ORPCError("NOT_FOUND", {
					message: "Chat not found",
				});
			}

			await db
				.update(assistantChat)
				.set({ title: input.title })
				.where(eq(assistantChat.id, input.chatId));

			return { success: true };
		}
	),
});

export type AssistantRouter = typeof assistantRouter;
