import { organization } from "@my-app/db/schema/auth";
import {
	contaktlyConversation,
	contaktlyWorkspaceConfig,
} from "@my-app/db/schema/contaktly";
import { bootstrapTestDatabase } from "@my-app/db/test";
import { describe, expect, it, vi } from "vitest";

const testDbState = bootstrapTestDatabase();

vi.doMock("@my-app/db", () => ({
	get db() {
		return testDbState.db;
	},
}));

const { listContaktlyConversationsForOrganization } = await import(
	"../lib/contaktly-conversations"
);

describe("contaktly conversations read model", () => {
	it("lists only conversations owned by the active organization", async () => {
		await testDbState.db.insert(organization).values([
			{ id: "org-1", name: "Org One", slug: "org-one" },
			{ id: "org-2", name: "Org Two", slug: "org-two" },
		]);

		await testDbState.db.insert(contaktlyWorkspaceConfig).values([
			{
				id: "config-1",
				organizationId: "org-1",
				publicConfigId: "ctly-demo-founder",
				bookingUrl: "https://calendly.com/demo-team/intro",
			},
			{
				id: "config-2",
				organizationId: "org-2",
				publicConfigId: "ctly-demo-founder-org-2",
				bookingUrl: "https://calendly.com/demo-team/follow-up",
			},
		]);

		await testDbState.db.insert(contaktlyConversation).values([
			{
				id: "conv-1",
				configId: "ctly-demo-founder",
				organizationId: "org-1",
				visitorId: "visitor-a",
				lastWidgetInstanceId: "instance-a",
				stage: "qualification",
				messages: [
					{
						id: "msg-1",
						role: "assistant",
						text: "What outcome do you need first?",
						createdAt: "2026-03-06T00:00:00.000Z",
						intent: "general",
						promptKey: "goal",
					},
					{
						id: "msg-2",
						role: "user",
						text: "Need more leads",
						createdAt: "2026-03-06T00:00:05.000Z",
					},
				],
			},
			{
				id: "conv-1b",
				configId: "ctly-demo-founder",
				organizationId: "org-1",
				visitorId: "aaa-visitor",
				lastWidgetInstanceId: "instance-c",
				stage: "ready_to_book",
				updatedAt: new Date("2026-03-06T00:01:00.000Z"),
				messages: [
					{
						id: "msg-2b",
						role: "assistant",
						text: "Book the strategy call now.",
						createdAt: "2026-03-06T00:01:00.000Z",
						intent: "lead-generation",
						promptKey: "timeline",
					},
				],
			},
			{
				id: "conv-2",
				configId: "ctly-demo-founder-org-2",
				organizationId: "org-2",
				visitorId: "visitor-b",
				lastWidgetInstanceId: "instance-b",
				stage: "ready_to_book",
				messages: [
					{
						id: "msg-3",
						role: "assistant",
						text: "Book the strategy call now.",
						createdAt: "2026-03-06T00:00:10.000Z",
						intent: "lead-generation",
						promptKey: "timeline",
					},
				],
			},
		]);

		const rows = await listContaktlyConversationsForOrganization("org-1");

		expect(rows).toHaveLength(2);
		expect(rows[0]?.conversationId).toBe("conv-1b");
		expect(rows[0]?.configId).toBe("ctly-demo-founder");
		expect(rows[0]?.lastMessageText).toBe("Book the strategy call now.");
		expect(rows[1]?.conversationId).toBe("conv-1");
		expect(rows[1]?.messageCount).toBe(2);
	});
});
