import type { ContractRouterClient } from "@orpc/contract";
import { eventIterator, oc } from "@orpc/contract";
import z from "zod";

const chatMessagePartSchema = z.record(z.string(), z.unknown());

const uiMessageSchema = z.object({
	id: z.string(),
	role: z.enum(["user", "assistant", "system"]),
	parts: z.array(chatMessagePartSchema),
	createdAt: z.string().datetime().optional(),
});

const chatOutputSchema = z.record(z.string(), z.unknown());

const chatItemSchema = z.object({
	id: z.string(),
	title: z.string(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const chatDetailSchema = z.object({
	id: z.string(),
	title: z.string(),
	userId: z.string(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
	messages: z.array(uiMessageSchema),
});

const successSchema = z.object({
	success: z.literal(true),
});

export const assistantContract = {
	chat: oc
		.route({
			tags: ["Chat"],
			summary: "Stream a chat response",
			description:
				"Sends messages to the assistant and streams back an AI response as an event iterator.",
		})
		.input(
			z.object({
				chatId: z.string(),
				messages: z.array(uiMessageSchema),
			}),
		)
		.output(eventIterator(chatOutputSchema)),

	createChat: oc
		.route({
			tags: ["Chat"],
			summary: "Create a new chat",
			description: "Creates a new assistant chat session.",
		})
		.input(z.object({ title: z.string().default("New Chat") }))
		.output(z.object({ id: z.string(), title: z.string() })),

	listChats: oc
		.route({
			tags: ["Chat"],
			summary: "List all chats",
			description: "Returns all chats for the current user.",
		})
		.output(z.array(chatItemSchema)),

	getChat: oc
		.route({
			tags: ["Chat"],
			summary: "Get chat with messages",
			description: "Returns a single chat and its full message history.",
		})
		.input(z.object({ chatId: z.string() }))
		.output(chatDetailSchema),

	deleteChat: oc
		.route({
			tags: ["Chat"],
			summary: "Delete a chat",
			description: "Deletes a chat and all its messages.",
		})
		.input(z.object({ chatId: z.string() }))
		.output(successSchema),

	updateChatTitle: oc
		.route({
			tags: ["Chat"],
			summary: "Update chat title",
			description: "Updates the title of an existing chat.",
		})
		.input(z.object({ chatId: z.string(), title: z.string() }))
		.output(successSchema),
};

export type AssistantContract = typeof assistantContract;
export type AssistantContractClient = ContractRouterClient<
	typeof assistantContract
>;
