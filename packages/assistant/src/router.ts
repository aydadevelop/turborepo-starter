import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { db } from "@full-stack-cf-app/db";
import {
	assistantChat,
	assistantMessage,
} from "@full-stack-cf-app/db/schema/assistant";
import { ORPCError, os, streamToEventIterator, type } from "@orpc/server";
import {
	type UIMessage,
	convertToModelMessages,
	stepCountIs,
	streamText,
} from "ai";
import { desc, eq } from "drizzle-orm";
import z from "zod";

import type { AssistantContext } from "./context";
import { createSystemPrompt } from "./system-prompt";
import { createAssistantTools } from "./tools";

const o = os.$context<AssistantContext>();

/** Fix legacy tool-invocation parts that were stored without proper state. */
function sanitizeParts(parts: unknown[]): UIMessage["parts"] {
	return (parts as UIMessage["parts"]).map((part) => {
		if ("type" in part && typeof part.type === "string" && part.type.startsWith("tool-")) {
			const p = part as Record<string, unknown>;
			// Fix legacy 'tool-invocation' type to proper 'tool-<name>' format
			const fixedType = part.type === "tool-invocation" && p.toolName
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
	});
}

const requireAuth = o.middleware(({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	if (!context.openRouterApiKey) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "AI provider not configured",
		});
	}
	return next();
});

const authenticatedProcedure = o.use(requireAuth);

export const assistantRouter = {
	chat: authenticatedProcedure
		.input(type<{ chatId: string; messages: UIMessage[] }>())
		.handler(async ({ input, context }) => {
			// Verify ownership
			const existing = await db
				.select({ id: assistantChat.id, userId: assistantChat.userId })
				.from(assistantChat)
				.where(eq(assistantChat.id, input.chatId))
				.get();

			if (!existing || existing.userId !== context.session!.user.id) {
				throw new ORPCError("NOT_FOUND", {
					message: "Chat not found",
				});
			}

			// Save the latest user message before streaming
			const lastUserMessage = input.messages[input.messages.length - 1];
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
			const tools = createAssistantTools({
				serverUrl: context.serverUrl,
				requestHeaders: context.requestHeaders,
			});

			const result = streamText({
				model: openrouter(context.aiModel || "openai/gpt-4o"),
				system: createSystemPrompt(),
				messages: await convertToModelMessages(input.messages),
				tools,
				stopWhen: stepCountIs(5),
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
							resultMap.set(tr.toolCallId, tr.result);
						}

						for (const tc of step.toolCalls) {
							if (resultMap.has(tc.toolCallId)) {
								parts.push({
									type: `tool-${tc.toolName}`,
									toolCallId: tc.toolCallId,
									state: "output-available",
									input: tc.args,
									output: resultMap.get(tc.toolCallId),
								});
							} else {
								parts.push({
									type: `tool-${tc.toolName}`,
									toolCallId: tc.toolCallId,
									state: "input-available",
									input: tc.args,
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

	createChat: authenticatedProcedure
		.input(z.object({ title: z.string().default("New Chat") }))
		.handler(async ({ input, context }) => {
			const userId = context.session!.user.id;
			const id = crypto.randomUUID();

			await db.insert(assistantChat).values({
				id,
				title: input.title,
				userId,
			});

			return { id, title: input.title };
		}),

	listChats: authenticatedProcedure.handler(async ({ context }) => {
		const userId = context.session!.user.id;

		return db
			.select({
				id: assistantChat.id,
				title: assistantChat.title,
				createdAt: assistantChat.createdAt,
				updatedAt: assistantChat.updatedAt,
			})
			.from(assistantChat)
			.where(eq(assistantChat.userId, userId))
			.orderBy(desc(assistantChat.updatedAt));
	}),

	getChat: authenticatedProcedure
		.input(z.object({ chatId: z.string() }))
		.handler(async ({ input, context }) => {
			const userId = context.session!.user.id;

			const chatRecord = await db
				.select()
				.from(assistantChat)
				.where(eq(assistantChat.id, input.chatId))
				.get();

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
				...chatRecord,
				messages: messages.map((m) => ({
					id: m.id,
					role: m.role as UIMessage["role"],
					parts: sanitizeParts(m.parts as UIMessage["parts"]),
					createdAt: m.createdAt,
				})),
			};
		}),

	deleteChat: authenticatedProcedure
		.input(z.object({ chatId: z.string() }))
		.handler(async ({ input, context }) => {
			const userId = context.session!.user.id;

			const chatRecord = await db
				.select({ id: assistantChat.id, userId: assistantChat.userId })
				.from(assistantChat)
				.where(eq(assistantChat.id, input.chatId))
				.get();

			if (!chatRecord || chatRecord.userId !== userId) {
				throw new ORPCError("NOT_FOUND", {
					message: "Chat not found",
				});
			}

			await db
				.delete(assistantChat)
				.where(eq(assistantChat.id, input.chatId));

			return { success: true };
		}),

	updateChatTitle: authenticatedProcedure
		.input(z.object({ chatId: z.string(), title: z.string() }))
		.handler(async ({ input, context }) => {
			const userId = context.session!.user.id;

			const chatRecord = await db
				.select({ id: assistantChat.id, userId: assistantChat.userId })
				.from(assistantChat)
				.where(eq(assistantChat.id, input.chatId))
				.get();

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
		}),
};

export type AssistantRouter = typeof assistantRouter;
