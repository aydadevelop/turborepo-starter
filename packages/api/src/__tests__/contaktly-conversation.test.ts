import {
	contaktlyConversation,
	contaktlyMessage,
	contaktlyTurn,
} from "@my-app/db/schema/contaktly";
import { bootstrapTestDatabase } from "@my-app/db/test";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

const testDbState = bootstrapTestDatabase();

vi.doMock("@my-app/db", () => ({
	get db() {
		return testDbState.db;
	},
}));

const { appendContaktlyConversationTurn, ensureContaktlyConversation } =
	await import("../lib/contaktly-conversation");

describe("contaktly conversation store", () => {
	it("creates one conversation per config and visitor", async () => {
		const first = await ensureContaktlyConversation({
			configId: "ctly-demo-founder",
			visitorId: "visitor-1",
			widgetInstanceId: "instance-1",
			openingMessage: "Hello from Ava",
		});

		const second = await ensureContaktlyConversation({
			configId: "ctly-demo-founder",
			visitorId: "visitor-1",
			widgetInstanceId: "instance-2",
			openingMessage: "Ignored for existing conversation",
		});

		expect(first.id).toBe(second.id);
		expect(second.lastWidgetInstanceId).toBe("instance-2");
		expect(second.stateVersion).toBe(0);
		expect(second.messages).toHaveLength(1);
		expect(second.messages[0]?.role).toBe("assistant");
	});

	it("appends user and assistant messages and bumps state version", async () => {
		const created = await ensureContaktlyConversation({
			configId: "ctly-demo-founder",
			visitorId: "visitor-2",
			widgetInstanceId: "instance-1",
			openingMessage: "How can I help?",
		});

		const result = await appendContaktlyConversationTurn({
			clientTurnId: "turn-1",
			configId: "ctly-demo-founder",
			visitorId: "visitor-2",
			widgetInstanceId: "instance-1",
			message: "I need website redesign support",
			stateVersion: created.stateVersion,
			pageTitle: "Homepage",
			tags: ["homepage"],
		});

		expect(result.stateVersion).toBe(1);
		expect(result.activePromptKey).toBe("pain_point");
		expect(result.reply.stage).toBe("qualification");
		expect(result.messages).toHaveLength(3);
		expect(result.messages.at(-2)?.role).toBe("user");
		expect(result.messages.at(-1)?.role).toBe("assistant");

		const [stored] = await testDbState.db
			.select()
			.from(contaktlyConversation)
			.where(eq(contaktlyConversation.id, result.conversationId));
		expect(stored?.stateVersion).toBe(1);

		const turns = await testDbState.db
			.select()
			.from(contaktlyTurn)
			.where(eq(contaktlyTurn.conversationId, result.conversationId));
		const messages = await testDbState.db
			.select()
			.from(contaktlyMessage)
			.where(eq(contaktlyMessage.conversationId, result.conversationId));
		expect(turns).toHaveLength(1);
		expect(messages).toHaveLength(3);
	});

	it("rejects stale state version updates", async () => {
		const created = await ensureContaktlyConversation({
			configId: "ctly-demo-founder",
			visitorId: "visitor-3",
			widgetInstanceId: "instance-1",
			openingMessage: "How can I help?",
		});

		await appendContaktlyConversationTurn({
			clientTurnId: "turn-1",
			configId: "ctly-demo-founder",
			visitorId: "visitor-3",
			widgetInstanceId: "instance-1",
			message: "I need leads",
			stateVersion: created.stateVersion,
		});

		await expect(
			appendContaktlyConversationTurn({
				clientTurnId: "turn-2",
				configId: "ctly-demo-founder",
				visitorId: "visitor-3",
				widgetInstanceId: "instance-1",
				message: "Second message with stale version",
				stateVersion: created.stateVersion,
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("returns an idempotent response for duplicate client turn ids", async () => {
		const created = await ensureContaktlyConversation({
			configId: "ctly-demo-founder",
			visitorId: "visitor-4",
			widgetInstanceId: "instance-1",
			openingMessage: "How can I help?",
		});

		const first = await appendContaktlyConversationTurn({
			clientTurnId: "turn-1",
			configId: "ctly-demo-founder",
			visitorId: "visitor-4",
			widgetInstanceId: "instance-1",
			message: "I need help with messaging",
			stateVersion: created.stateVersion,
		});

		const second = await appendContaktlyConversationTurn({
			clientTurnId: "turn-1",
			configId: "ctly-demo-founder",
			visitorId: "visitor-4",
			widgetInstanceId: "instance-1",
			message: "I need help with messaging",
			stateVersion: created.stateVersion,
		});

		expect(second.conversationId).toBe(first.conversationId);
		expect(second.stateVersion).toBe(first.stateVersion);
		expect(second.messages).toEqual(first.messages);

		const turns = await testDbState.db
			.select()
			.from(contaktlyTurn)
			.where(eq(contaktlyTurn.conversationId, first.conversationId));
		expect(turns).toHaveLength(1);
		expect(turns[0]?.clientTurnId).toBe("turn-1");
	});

	it("advances the flow to ready_to_book after required answers", async () => {
		const created = await ensureContaktlyConversation({
			configId: "ctly-demo-founder",
			visitorId: "visitor-5",
			widgetInstanceId: "instance-1",
			openingMessage: "How can I help?",
		});

		const first = await appendContaktlyConversationTurn({
			clientTurnId: "turn-1",
			configId: "ctly-demo-founder",
			visitorId: "visitor-5",
			widgetInstanceId: "instance-1",
			message: "We need a website redesign",
			stateVersion: created.stateVersion,
		});

		expect(first.reply.stage).toBe("qualification");
		expect(first.reply.promptKey).toBe("pain_point");

		const second = await appendContaktlyConversationTurn({
			clientTurnId: "turn-2",
			configId: "ctly-demo-founder",
			visitorId: "visitor-5",
			widgetInstanceId: "instance-1",
			message: "Homepage does not convert",
			stateVersion: first.stateVersion,
		});

		expect(second.reply.stage).toBe("qualification");
		expect(second.reply.promptKey).toBe("timeline");

		const third = await appendContaktlyConversationTurn({
			clientTurnId: "turn-3",
			configId: "ctly-demo-founder",
			visitorId: "visitor-5",
			widgetInstanceId: "instance-1",
			message: "Launch in 2 weeks",
			stateVersion: second.stateVersion,
		});

		expect(third.reply.stage).toBe("ready_to_book");
		expect(third.reply.assistantMessage).toContain("qualified");
		expect(third.stateVersion).toBe(3);

		const [stored] = await testDbState.db
			.select()
			.from(contaktlyConversation)
			.where(eq(contaktlyConversation.id, third.conversationId));

		expect(stored?.stage).toBe("ready_to_book");
		expect(stored?.slots).toMatchObject({
			goal: "We need a website redesign",
			pain_point: "Homepage does not convert",
			timeline: "Launch in 2 weeks",
		});
	});
});
