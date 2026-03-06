import { organization, user } from "@my-app/db/schema/auth";
import {
	contaktlyCalendarConnection,
	contaktlyConversation,
	contaktlyPrefillDraft,
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

const { getContaktlyAnalyticsSummary } = await import(
	"../lib/contaktly-analytics"
);

describe("contaktly analytics summary", () => {
	it("rolls up current organization conversations into demo-ready KPI cards", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-analytics",
			name: "Analytics Org",
			slug: "analytics-org",
		});
		await testDbState.db.insert(user).values({
			id: "analytics-user",
			name: "Analytics Admin",
			email: "analytics@example.com",
			emailVerified: true,
		});
		await testDbState.db.insert(contaktlyWorkspaceConfig).values({
			id: "config-analytics",
			organizationId: "org-analytics",
			publicConfigId: "ctly-demo-founder",
			bookingUrl: "https://calendly.com/demo-team/intro",
		});
		await testDbState.db.insert(contaktlyPrefillDraft).values({
			id: "prefill-analytics",
			publicConfigId: "ctly-demo-founder",
			sourceUrl: "https://marygold.studio/",
			siteTitle: "Mary Gold Studio",
			businessSummary: "Founder-led studio for B2B service businesses.",
			openingMessage: "Tell me what you are building.",
			starterCards: ["Website redesign", "Messaging", "Lead generation"],
			customInstructions: "Stay sales-focused.",
			qualifiedLeadDefinition: "Founder-led B2B team with active demand.",
		});
		await testDbState.db.insert(contaktlyCalendarConnection).values({
			id: "calendar-analytics",
			publicConfigId: "ctly-demo-founder",
			provider: "google",
			providerAccountId: "google-admin-sub",
			connectedUserId: "analytics-user",
			accountEmail: "analytics@example.com",
			calendarId: "primary",
			scopes: ["https://www.googleapis.com/auth/calendar.events"],
		});
		await testDbState.db.insert(contaktlyConversation).values([
			{
				id: "conv-analytics-1",
				configId: "ctly-demo-founder",
				organizationId: "org-analytics",
				visitorId: "visitor-redesign",
				lastWidgetInstanceId: "instance-1",
				lastIntent: "website-redesign",
				stage: "ready_to_book",
				messages: [
					{
						id: "msg-a1",
						role: "assistant",
						text: "What are you building?",
						createdAt: "2026-03-06T00:00:00.000Z",
						intent: "general",
						promptKey: "goal",
					},
					{
						id: "msg-a2",
						role: "user",
						text: "We need a redesign",
						createdAt: "2026-03-06T00:00:05.000Z",
					},
					{
						id: "msg-a3",
						role: "assistant",
						text: "Book the strategy call now.",
						createdAt: "2026-03-06T00:00:10.000Z",
						intent: "website-redesign",
						promptKey: "timeline",
					},
				],
			},
			{
				id: "conv-analytics-2",
				configId: "ctly-demo-founder",
				organizationId: "org-analytics",
				visitorId: "visitor-growth",
				lastWidgetInstanceId: "instance-2",
				lastIntent: "lead-generation",
				stage: "qualification",
				messages: [
					{
						id: "msg-b1",
						role: "assistant",
						text: "What is the main growth target?",
						createdAt: "2026-03-06T00:01:00.000Z",
						intent: "general",
						promptKey: "goal",
					},
					{
						id: "msg-b2",
						role: "user",
						text: "More pipeline",
						createdAt: "2026-03-06T00:01:05.000Z",
					},
				],
			},
		]);

		const summary = await getContaktlyAnalyticsSummary("org-analytics");

		expect(summary.totalConversations).toBe(2);
		expect(summary.readyToBookConversations).toBe(1);
		expect(summary.qualificationRate).toBe(50);
		expect(summary.averageMessagesPerConversation).toBe(2.5);
		expect(summary.calendarConnected).toBe(true);
		expect(summary.hasPrefillDraft).toBe(true);
		expect(summary.intentBreakdown).toEqual([
			{ intent: "lead-generation", count: 1 },
			{ intent: "website-redesign", count: 1 },
		]);
		expect(summary.recentConversations[0]?.conversationId).toBe(
			"conv-analytics-2"
		);
		expect(summary.recentConversations[1]?.conversationId).toBe(
			"conv-analytics-1"
		);
	});
});
