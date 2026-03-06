import { randomUUID } from "node:crypto";
import { db } from "@my-app/db";
import {
	type ContaktlyConversationMessage,
	type ContaktlyConversationSlots,
	contaktlyConversation,
	contaktlyMessage,
	contaktlyTurn,
} from "@my-app/db/schema/contaktly";
import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";

import {
	buildDemoFlowReply,
	type DemoWidgetIntent,
	type DemoWidgetPromptKey,
	type DemoWidgetReply,
} from "./contaktly-demo";

export interface EnsureConversationInput {
	configId: string;
	openingMessage: string;
	organizationId?: string | null;
	visitorId: string;
	widgetInstanceId: string;
}

export interface AppendConversationTurnInput {
	clientTurnId: string;
	configId: string;
	message: string;
	pageTitle?: string;
	stateVersion: number;
	tags?: string[];
	visitorId: string;
	widgetInstanceId: string;
}

export interface ContaktlyConversationTurnResult {
	activePromptKey: DemoWidgetPromptKey;
	conversationId: string;
	messages: ContaktlyConversationMessage[];
	reply: DemoWidgetReply;
	stateVersion: number;
}

interface PreparedContaktlyConversationTurn {
	activePromptKey: DemoWidgetPromptKey;
	configId: string;
	conversationId: string;
	currentIntent: DemoWidgetIntent;
	currentMessages: ContaktlyConversationMessage[];
	currentPromptKey: DemoWidgetPromptKey;
	nextMessageOrder: number;
	pageTitle?: string;
	reply: DemoWidgetReply;
	slots: ContaktlyConversationSlots;
	stateVersion: number;
	tags?: string[];
	userMessage: string;
	visitorId: string;
	widgetInstanceId: string;
}

interface ConversationMessageRow {
	createdAt: Date;
	id: string;
	intent: DemoWidgetIntent | null;
	promptKey: DemoWidgetPromptKey | null;
	role: "assistant" | "user";
	text: string;
}

const byConfigAndVisitor = (configId: string, visitorId: string) =>
	and(
		eq(contaktlyConversation.configId, configId),
		eq(contaktlyConversation.visitorId, visitorId)
	);

const toTranscriptMessage = (
	message: ConversationMessageRow
): ContaktlyConversationMessage => ({
	id: message.id,
	role: message.role,
	text: message.text,
	createdAt: message.createdAt.toISOString(),
	intent: message.intent ?? undefined,
	promptKey: message.promptKey ?? undefined,
});

const listConversationMessages = async (conversationId: string) => {
	const rows = await db
		.select({
			id: contaktlyMessage.id,
			role: contaktlyMessage.role,
			text: contaktlyMessage.text,
			createdAt: contaktlyMessage.createdAt,
			intent: contaktlyMessage.intent,
			promptKey: contaktlyMessage.promptKey,
		})
		.from(contaktlyMessage)
		.where(eq(contaktlyMessage.conversationId, conversationId))
		.orderBy(asc(contaktlyMessage.messageOrder));

	return rows.map(toTranscriptMessage);
};

const makeConversationMessage = ({
	role,
	text,
	intent,
	promptKey,
}: {
	role: "assistant" | "user";
	text: string;
	intent?: DemoWidgetIntent;
	promptKey?: DemoWidgetPromptKey;
}): ContaktlyConversationMessage => ({
	id: randomUUID(),
	role,
	text,
	createdAt: new Date().toISOString(),
	intent,
	promptKey,
});

const hydrateLegacyMessages = async (
	conversationId: string,
	messages: ContaktlyConversationMessage[]
) => {
	if (messages.length === 0) {
		return;
	}

	await db.insert(contaktlyMessage).values(
		messages.map((message, index) => ({
			id: message.id,
			conversationId,
			messageOrder: index + 1,
			role: message.role,
			text: message.text,
			intent: message.intent ?? null,
			promptKey: message.promptKey ?? null,
		}))
	);
};

const isRetryableTurnError = (error: unknown) => {
	if (error instanceof ORPCError) {
		return error.code === "BAD_REQUEST";
	}

	if (!(error instanceof Error)) {
		return false;
	}

	// PostgreSQL duplicate key violations surface as 23505 in production.
	const withCode = error as Error & { code?: string };
	return (
		withCode.code === "23505" ||
		error.message.toLowerCase().includes("duplicate key")
	);
};

const findTurnByClientTurnId = async ({
	clientTurnId,
	conversationId,
}: {
	clientTurnId: string;
	conversationId: string;
}) => {
	const [existingTurn] = await db
		.select({
			id: contaktlyTurn.id,
		})
		.from(contaktlyTurn)
		.where(
			and(
				eq(contaktlyTurn.conversationId, conversationId),
				eq(contaktlyTurn.clientTurnId, clientTurnId)
			)
		)
		.limit(1);

	return existingTurn ?? null;
};

const loadReplyForExistingTurn = async ({
	conversationId,
	turnId,
}: {
	conversationId: string;
	turnId: string;
}): Promise<ContaktlyConversationTurnResult> => {
	const [conversation] = await db
		.select({
			id: contaktlyConversation.id,
			activePromptKey: contaktlyConversation.activePromptKey,
			lastIntent: contaktlyConversation.lastIntent,
			stage: contaktlyConversation.stage,
			stateVersion: contaktlyConversation.stateVersion,
			slots: contaktlyConversation.slots,
		})
		.from(contaktlyConversation)
		.where(eq(contaktlyConversation.id, conversationId))
		.limit(1);

	if (!conversation) {
		throw new ORPCError("NOT_FOUND", {
			message: "Conversation not found. Reload widget bootstrap first.",
		});
	}

	const messages = await listConversationMessages(conversation.id);
	const [assistantForTurn] = await db
		.select({
			text: contaktlyMessage.text,
			intent: contaktlyMessage.intent,
			promptKey: contaktlyMessage.promptKey,
		})
		.from(contaktlyMessage)
		.where(
			and(
				eq(contaktlyMessage.conversationId, conversation.id),
				eq(contaktlyMessage.turnId, turnId),
				eq(contaktlyMessage.role, "assistant")
			)
		)
		.orderBy(asc(contaktlyMessage.messageOrder))
		.limit(1);

	const fallbackAssistant = [...messages]
		.reverse()
		.find((message) => message.role === "assistant");

	const replyIntent =
		assistantForTurn?.intent ?? conversation.lastIntent ?? "general";
	const replyPromptKey =
		assistantForTurn?.promptKey ?? conversation.activePromptKey ?? "goal";
	const slots: ContaktlyConversationSlots = conversation.slots ?? {};

	return {
		conversationId: conversation.id,
		messages,
		stateVersion: conversation.stateVersion,
		activePromptKey: conversation.activePromptKey,
		reply: {
			assistantMessage:
				assistantForTurn?.text ??
				fallbackAssistant?.text ??
				"Request processed.",
			intent: replyIntent,
			promptKey: replyPromptKey,
			stage: conversation.stage,
			slots,
		},
	};
};

export const ensureContaktlyConversation = async ({
	configId,
	openingMessage,
	organizationId,
	visitorId,
	widgetInstanceId,
}: EnsureConversationInput) => {
	const [existing] = await db
		.select()
		.from(contaktlyConversation)
		.where(byConfigAndVisitor(configId, visitorId))
		.limit(1);

	if (!existing) {
		const opening = makeConversationMessage({
			role: "assistant",
			text: openingMessage,
			intent: "general",
			promptKey: "goal",
		});

		const [created] = await db
			.insert(contaktlyConversation)
			.values({
				id: randomUUID(),
				configId,
				organizationId: organizationId ?? null,
				visitorId,
				lastWidgetInstanceId: widgetInstanceId,
				activePromptKey: "goal",
				lastIntent: "general",
				stage: "qualification",
				slots: {},
				stateVersion: 0,
				nextMessageOrder: 2,
				messages: [opening],
			})
			.returning();

		if (created) {
			await db.insert(contaktlyMessage).values({
				id: opening.id,
				conversationId: created.id,
				messageOrder: 1,
				role: opening.role,
				text: opening.text,
				intent: opening.intent ?? null,
				promptKey: opening.promptKey ?? null,
			});

			return {
				...created,
				messages: [opening],
			};
		}

		// Unique conflict fallback for concurrent bootstrap calls.
		const [reloaded] = await db
			.select()
			.from(contaktlyConversation)
			.where(byConfigAndVisitor(configId, visitorId))
			.limit(1);

		if (!reloaded) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Failed to create or load Contaktly conversation.",
			});
		}

		const fallbackMessages = await listConversationMessages(reloaded.id);
		return {
			...reloaded,
			messages: fallbackMessages,
		};
	}

	let touched = existing;
	const needsConversationTouch =
		existing.lastWidgetInstanceId !== widgetInstanceId ||
		(!existing.organizationId && organizationId);
	if (needsConversationTouch) {
		const [updated] = await db
			.update(contaktlyConversation)
			.set({
				lastWidgetInstanceId: widgetInstanceId,
				organizationId: existing.organizationId ?? organizationId ?? null,
			})
			.where(eq(contaktlyConversation.id, existing.id))
			.returning();

		touched = updated ?? existing;
	}

	let storedMessages = await listConversationMessages(touched.id);

	if (storedMessages.length === 0 && touched.messages.length > 0) {
		await hydrateLegacyMessages(touched.id, touched.messages);
		await db
			.update(contaktlyConversation)
			.set({
				nextMessageOrder: Math.max(
					touched.nextMessageOrder,
					touched.messages.length + 1
				),
			})
			.where(eq(contaktlyConversation.id, touched.id));
		storedMessages = await listConversationMessages(touched.id);
	}

	if (storedMessages.length === 0) {
		const opening = makeConversationMessage({
			role: "assistant",
			text: openingMessage,
			intent: "general",
			promptKey: "goal",
		});
		const insertOrder = Math.max(1, touched.nextMessageOrder);

		await db.insert(contaktlyMessage).values({
			id: opening.id,
			conversationId: touched.id,
			messageOrder: insertOrder,
			role: opening.role,
			text: opening.text,
			intent: opening.intent ?? null,
			promptKey: opening.promptKey ?? null,
		});

		const [updated] = await db
			.update(contaktlyConversation)
			.set({
				nextMessageOrder: insertOrder + 1,
				messages: [opening],
			})
			.where(eq(contaktlyConversation.id, touched.id))
			.returning();
		touched = updated ?? touched;
		storedMessages = [opening];
	}

	return {
		...touched,
		messages: storedMessages,
	};
};

export const appendContaktlyConversationTurn = async ({
	clientTurnId,
	configId,
	message,
	pageTitle,
	stateVersion,
	tags,
	visitorId,
	widgetInstanceId,
}: AppendConversationTurnInput): Promise<ContaktlyConversationTurnResult> => {
	const prepared = await prepareContaktlyConversationTurn({
		clientTurnId,
		configId,
		message,
		pageTitle,
		stateVersion,
		tags,
		visitorId,
		widgetInstanceId,
	});

	if ("existing" in prepared) {
		return prepared.existing;
	}

	const { prepared: nextTurn } = prepared;

	return commitContaktlyConversationTurn({
		assistantMessage: nextTurn.reply.assistantMessage,
		clientTurnId,
		prepared: nextTurn,
	});
};

export const prepareContaktlyConversationTurn = async ({
	clientTurnId,
	configId,
	message,
	pageTitle,
	stateVersion,
	tags,
	visitorId,
	widgetInstanceId,
}: AppendConversationTurnInput): Promise<
	| { existing: ContaktlyConversationTurnResult }
	| { prepared: PreparedContaktlyConversationTurn }
> => {
	const [existing] = await db
		.select()
		.from(contaktlyConversation)
		.where(byConfigAndVisitor(configId, visitorId))
		.limit(1);

	if (!existing) {
		throw new ORPCError("NOT_FOUND", {
			message: "Conversation not found. Reload widget bootstrap first.",
		});
	}

	if (existing.stateVersion !== stateVersion) {
		const duplicate = await findTurnByClientTurnId({
			clientTurnId,
			conversationId: existing.id,
		});

		if (duplicate) {
			return {
				existing: await loadReplyForExistingTurn({
					conversationId: existing.id,
					turnId: duplicate.id,
				}),
			};
		}

		throw new ORPCError("BAD_REQUEST", {
			message: "Conversation state is stale. Reload and retry.",
		});
	}

	return {
		prepared: {
			activePromptKey: existing.activePromptKey,
			configId,
			conversationId: existing.id,
			currentIntent: existing.lastIntent,
			currentMessages: await listConversationMessages(existing.id),
			currentPromptKey: existing.activePromptKey,
			nextMessageOrder: existing.nextMessageOrder,
			pageTitle,
			reply: buildDemoFlowReply({
				currentIntent: existing.lastIntent,
				currentPromptKey: existing.activePromptKey,
				message,
				pageTitle,
				slots: existing.slots,
				tags,
			}),
			slots: existing.slots,
			stateVersion,
			tags,
			userMessage: message,
			visitorId,
			widgetInstanceId,
		},
	};
};

export const commitContaktlyConversationTurn = async ({
	assistantMessage,
	clientTurnId,
	prepared,
}: {
	assistantMessage: string;
	clientTurnId: string;
	prepared: PreparedContaktlyConversationTurn;
}): Promise<ContaktlyConversationTurnResult> => {
	try {
		return await db.transaction(async (tx) => {
			const [matched] = await tx
				.select({
					id: contaktlyConversation.id,
					nextMessageOrder: contaktlyConversation.nextMessageOrder,
					stateVersion: contaktlyConversation.stateVersion,
					activePromptKey: contaktlyConversation.activePromptKey,
					lastIntent: contaktlyConversation.lastIntent,
					slots: contaktlyConversation.slots,
				})
				.from(contaktlyConversation)
				.where(
					and(
						eq(contaktlyConversation.id, prepared.conversationId),
						eq(contaktlyConversation.stateVersion, prepared.stateVersion)
					)
				)
				.limit(1);

			if (!matched) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Conversation state changed during update. Reload and retry.",
				});
			}
			const reply: DemoWidgetReply = {
				...prepared.reply,
				assistantMessage,
			};

			const turnId = randomUUID();
			const userMessageId = randomUUID();
			const assistantMessageId = randomUUID();
			const userOrder = Math.max(1, matched.nextMessageOrder);
			const assistantOrder = userOrder + 1;
			const nextStateVersion = prepared.stateVersion + 1;
			const userMessageCreatedAt = new Date().toISOString();
			const assistantMessageCreatedAt = new Date().toISOString();
			const nextMessagesPreview: ContaktlyConversationMessage[] = [
				...prepared.currentMessages,
				{
					id: userMessageId,
					role: "user",
					text: prepared.userMessage,
					createdAt: userMessageCreatedAt,
				},
				{
					id: assistantMessageId,
					role: "assistant",
					text: reply.assistantMessage,
					createdAt: assistantMessageCreatedAt,
					intent: reply.intent,
					promptKey: reply.promptKey,
				},
			];

			await tx.insert(contaktlyTurn).values({
				id: turnId,
				conversationId: matched.id,
				clientTurnId,
				stateVersionBefore: prepared.stateVersion,
				stateVersionAfter: nextStateVersion,
				userInput: prepared.userMessage,
			});

			await tx.insert(contaktlyMessage).values([
				{
					id: userMessageId,
					conversationId: matched.id,
					turnId,
					messageOrder: userOrder,
					role: "user",
					text: prepared.userMessage,
					intent: null,
					promptKey: null,
				},
				{
					id: assistantMessageId,
					conversationId: matched.id,
					turnId,
					messageOrder: assistantOrder,
					role: "assistant",
					text: reply.assistantMessage,
					intent: reply.intent,
					promptKey: reply.promptKey,
				},
			]);

			const [updated] = await tx
				.update(contaktlyConversation)
				.set({
					lastWidgetInstanceId: prepared.widgetInstanceId,
					activePromptKey: reply.promptKey,
					lastIntent: reply.intent,
					stage: reply.stage,
					slots: reply.slots,
					stateVersion: nextStateVersion,
					nextMessageOrder: assistantOrder + 1,
					messages: nextMessagesPreview,
				})
				.where(
					and(
						eq(contaktlyConversation.id, matched.id),
						eq(contaktlyConversation.stateVersion, prepared.stateVersion)
					)
				)
				.returning();

			if (!updated) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Conversation state changed during update. Reload and retry.",
				});
			}

			const rows = await tx
				.select({
					id: contaktlyMessage.id,
					role: contaktlyMessage.role,
					text: contaktlyMessage.text,
					createdAt: contaktlyMessage.createdAt,
					intent: contaktlyMessage.intent,
					promptKey: contaktlyMessage.promptKey,
				})
				.from(contaktlyMessage)
				.where(eq(contaktlyMessage.conversationId, matched.id))
				.orderBy(asc(contaktlyMessage.messageOrder));

			return {
				conversationId: updated.id,
				messages: rows.map(toTranscriptMessage),
				stateVersion: updated.stateVersion,
				activePromptKey: updated.activePromptKey,
				reply,
			};
		});
	} catch (error) {
		if (!isRetryableTurnError(error)) {
			throw error;
		}

		const duplicate = await findTurnByClientTurnId({
			clientTurnId,
			conversationId: prepared.conversationId,
		});

		if (!duplicate) {
			throw error;
		}

		return loadReplyForExistingTurn({
			conversationId: prepared.conversationId,
			turnId: duplicate.id,
		});
	}
};
