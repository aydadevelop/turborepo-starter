import {
	contaktlyConversation,
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

const { ensureContaktlyConversation } = await import(
	"../lib/contaktly-conversation"
);
const { createContaktlyWidgetChatStream } = await import(
	"../lib/contaktly-widget-chat"
);

const readStreamChunks = async (
	stream: ReadableStream<Record<string, unknown>>
) => {
	const reader = stream.getReader();
	const chunks: Record<string, unknown>[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		chunks.push(value);
	}

	return chunks;
};

const getStreamedText = (chunks: Record<string, unknown>[]) =>
	chunks
		.filter((chunk) => chunk.type === "text-delta")
		.map((chunk) => String(chunk.delta ?? ""))
		.join("");

describe("contaktly widget chat stream", () => {
	it("streams a fallback assistant reply and commits the turn", async () => {
		const created = await ensureContaktlyConversation({
			configId: "ctly-demo-founder",
			visitorId: "visitor-stream-1",
			widgetInstanceId: "instance-1",
			openingMessage: "How can I help?",
		});

		const stream = await createContaktlyWidgetChatStream({
			aiModel: "openai/gpt-5-nano:nitro",
			clientTurnId: "turn-stream-1",
			configId: "ctly-demo-founder",
			hostOrigin: "http://localhost:43275",
			messageId: undefined,
			messages: [
				{
					id: "assistant-1",
					role: "assistant",
					parts: [{ type: "text", text: "How can I help?" }],
				},
				{
					id: "user-1",
					role: "user",
					parts: [{ type: "text", text: "We need a website redesign" }],
				},
			],
			openRouterApiKey: "e2e-openrouter-placeholder",
			pageTitle: "Homepage",
			sourceUrl: "http://localhost:43275/",
			stateVersion: created.stateVersion,
			tags: ["homepage"],
			visitorId: "visitor-stream-1",
			widgetInstanceId: "instance-1",
		});

		const chunks = await readStreamChunks(stream);
		expect(getStreamedText(chunks)).toBe(
			"What is the biggest conversion blocker on the current site right now?"
		);

		const [storedConversation] = await testDbState.db
			.select()
			.from(contaktlyConversation)
			.where(eq(contaktlyConversation.id, created.id));
		expect(storedConversation?.stateVersion).toBe(1);
		expect(storedConversation?.activePromptKey).toBe("pain_point");

		const turns = await testDbState.db
			.select()
			.from(contaktlyTurn)
			.where(eq(contaktlyTurn.conversationId, created.id));
		expect(turns).toHaveLength(1);
		expect(turns[0]?.clientTurnId).toBe("turn-stream-1");
	});

	it("replays the persisted assistant reply for duplicate client turn ids", async () => {
		const created = await ensureContaktlyConversation({
			configId: "ctly-demo-founder",
			visitorId: "visitor-stream-2",
			widgetInstanceId: "instance-1",
			openingMessage: "How can I help?",
		});

		const firstStream = await createContaktlyWidgetChatStream({
			aiModel: "openai/gpt-5-nano:nitro",
			clientTurnId: "turn-stream-2",
			configId: "ctly-demo-founder",
			hostOrigin: "http://localhost:43275",
			messageId: undefined,
			messages: [
				{
					id: "assistant-1",
					role: "assistant",
					parts: [{ type: "text", text: "How can I help?" }],
				},
				{
					id: "user-1",
					role: "user",
					parts: [{ type: "text", text: "We need a website redesign" }],
				},
			],
			openRouterApiKey: "e2e-openrouter-placeholder",
			pageTitle: "Homepage",
			sourceUrl: "http://localhost:43275/",
			stateVersion: created.stateVersion,
			tags: ["homepage"],
			visitorId: "visitor-stream-2",
			widgetInstanceId: "instance-1",
		});
		const firstText = getStreamedText(await readStreamChunks(firstStream));

		const secondStream = await createContaktlyWidgetChatStream({
			aiModel: "openai/gpt-5-nano:nitro",
			clientTurnId: "turn-stream-2",
			configId: "ctly-demo-founder",
			hostOrigin: "http://localhost:43275",
			messageId: undefined,
			messages: [
				{
					id: "assistant-1",
					role: "assistant",
					parts: [{ type: "text", text: "How can I help?" }],
				},
				{
					id: "user-1",
					role: "user",
					parts: [{ type: "text", text: "We need a website redesign" }],
				},
			],
			openRouterApiKey: "e2e-openrouter-placeholder",
			pageTitle: "Homepage",
			sourceUrl: "http://localhost:43275/",
			stateVersion: created.stateVersion,
			tags: ["homepage"],
			visitorId: "visitor-stream-2",
			widgetInstanceId: "instance-1",
		});
		const secondText = getStreamedText(await readStreamChunks(secondStream));

		expect(secondText).toBe(firstText);

		const turns = await testDbState.db
			.select()
			.from(contaktlyTurn)
			.where(eq(contaktlyTurn.conversationId, created.id));
		expect(turns).toHaveLength(1);
	});
});
