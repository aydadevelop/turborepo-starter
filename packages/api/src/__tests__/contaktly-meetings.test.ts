import { organization, user } from "@my-app/db/schema/auth";
import {
	contaktlyCalendarConnection,
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

const { getContaktlyMeetingPipeline } = await import(
	"../lib/contaktly-meetings"
);

describe("contaktly meeting pipeline", () => {
	it("combines booking setup with ready-to-book conversations for the current workspace", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-meetings",
			name: "Meetings Org",
			slug: "meetings-org",
		});
		await testDbState.db.insert(user).values({
			id: "meetings-user",
			name: "Meetings Admin",
			email: "meetings@example.com",
			emailVerified: true,
		});
		await testDbState.db.insert(contaktlyWorkspaceConfig).values({
			id: "config-meetings",
			organizationId: "org-meetings",
			publicConfigId: "ctly-demo-founder",
			bookingUrl: "https://calendly.com/demo-team/intro",
		});
		await testDbState.db.insert(contaktlyCalendarConnection).values({
			id: "calendar-meetings",
			publicConfigId: "ctly-demo-founder",
			provider: "google",
			providerAccountId: "google-meetings",
			connectedUserId: "meetings-user",
			accountEmail: "meetings@example.com",
			calendarId: "primary",
			scopes: ["https://www.googleapis.com/auth/calendar.events"],
		});
		await testDbState.db.insert(contaktlyConversation).values([
			{
				id: "conv-meetings-ready",
				configId: "ctly-demo-founder",
				organizationId: "org-meetings",
				visitorId: "visitor-ready",
				lastWidgetInstanceId: "instance-ready",
				stage: "ready_to_book",
				lastIntent: "messaging",
				slots: {
					goal: "Sharpen pipeline messaging",
					timeline: "This month",
				},
				messages: [
					{
						id: "msg-ready",
						role: "assistant",
						text: "Book the strategy call now.",
						createdAt: "2026-03-06T00:00:00.000Z",
						intent: "messaging",
						promptKey: "timeline",
					},
				],
			},
			{
				id: "conv-meetings-open",
				configId: "ctly-demo-founder",
				organizationId: "org-meetings",
				visitorId: "visitor-open",
				lastWidgetInstanceId: "instance-open",
				stage: "qualification",
				lastIntent: "general",
				messages: [
					{
						id: "msg-open",
						role: "assistant",
						text: "What are you trying to fix first?",
						createdAt: "2026-03-06T00:01:00.000Z",
						intent: "general",
						promptKey: "goal",
					},
				],
			},
		]);

		const meetings = await getContaktlyMeetingPipeline({
			configId: "ctly-demo-founder",
			organizationId: "org-meetings",
			userId: "meetings-user",
		});

		expect(meetings.bookingUrl).toBe("https://calendly.com/demo-team/intro");
		expect(meetings.calendar.status).toBe("connected");
		expect(meetings.readyToBookConversations).toHaveLength(1);
		expect(meetings.readyToBookConversations[0]?.visitorId).toBe(
			"visitor-ready"
		);
		expect(meetings.readyToBookConversations[0]?.lastMessageText).toBe(
			"Book the strategy call now."
		);
	});
});
