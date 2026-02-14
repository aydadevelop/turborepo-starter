import { describe, expect, it, vi } from "vitest";

// Mock @full-stack-cf-app/db before any module that transitively imports it
// (event-bus → notifications/pusher → db → env/server → cloudflare:workers)
vi.doMock("@full-stack-cf-app/db", () => ({ db: {} }));

const mockPusher = vi.fn().mockResolvedValue(undefined);
vi.doMock("@full-stack-cf-app/notifications/pusher", () => ({
	notificationsPusher: mockPusher,
}));

const { EventBus, buildRecipients } = await import("../lib/event-bus");

describe("buildRecipients", () => {
	it("deduplicates and filters null/undefined user IDs", () => {
		const recipients = buildRecipients({
			userIds: ["user-1", null, "user-2", undefined, "user-1"],
			title: "Test",
			body: "body",
			ctaUrl: "/test",
		});

		expect(recipients).toHaveLength(2);
		expect(recipients.map((r) => r.userId)).toEqual(["user-1", "user-2"]);
	});

	it("returns empty array when all IDs are null", () => {
		const recipients = buildRecipients({
			userIds: [null, undefined],
			title: "Test",
		});

		expect(recipients).toHaveLength(0);
	});

	it("applies shared fields to all recipients", () => {
		const recipients = buildRecipients({
			userIds: ["user-1", "user-2"],
			title: "Alert",
			body: "Something happened",
			ctaUrl: "/dashboard",
			severity: "warning",
			channels: ["in_app"],
			metadata: { key: "value" },
		});

		for (const r of recipients) {
			expect(r.title).toBe("Alert");
			expect(r.body).toBe("Something happened");
			expect(r.ctaUrl).toBe("/dashboard");
			expect(r.severity).toBe("warning");
			expect(r.channels).toEqual(["in_app"]);
			expect(r.metadata).toEqual({ key: "value" });
		}
	});

	it("defaults channels to in_app", () => {
		const [r] = buildRecipients({
			userIds: ["user-1"],
			title: "Test",
		});
		expect(r?.channels).toEqual(["in_app"]);
	});
});

describe("EventBus", () => {
	it("starts empty", () => {
		const bus = new EventBus();
		expect(bus.size).toBe(0);
		expect(bus.pending).toEqual([]);
	});

	it("accumulates emitted events", () => {
		const bus = new EventBus();

		bus.emit({
			type: "support.ticket.created",
			organizationId: "org-1",
			sourceType: "support_ticket",
			sourceId: "ticket-1",
			payload: { ticketId: "ticket-1", subject: "Test" },
			recipients: [{ userId: "user-1", title: "New ticket" }],
		});

		bus.emit({
			type: "booking.created",
			organizationId: "org-1",
			sourceType: "booking",
			sourceId: "booking-1",
			payload: {
				bookingId: "booking-1",
				boatName: "Test Boat",
				windowText: "10:00-12:00",
			},
			recipients: [{ userId: "user-2", title: "New booking" }],
		});

		expect(bus.size).toBe(2);
		expect(bus.pending[0]?.type).toBe("support.ticket.created");
		expect(bus.pending[1]?.type).toBe("booking.created");
	});

	it("skips events with no recipients", () => {
		const bus = new EventBus();

		bus.emit({
			type: "support.ticket.created",
			organizationId: "org-1",
			sourceType: "support_ticket",
			sourceId: "ticket-1",
			payload: { ticketId: "ticket-1", subject: "Test" },
			recipients: [],
		});

		expect(bus.size).toBe(0);
	});

	it("flush clears pending events and calls notificationsPusher", async () => {
		mockPusher.mockClear();
		const bus = new EventBus();

		bus.emit({
			type: "support.ticket.created",
			organizationId: "org-1",
			actorUserId: "actor-1",
			sourceType: "support_ticket",
			sourceId: "ticket-1",
			payload: { ticketId: "ticket-1", subject: "Help" },
			recipients: [{ userId: "user-1", title: "New ticket: Help" }],
		});

		await bus.flush();

		expect(bus.size).toBe(0);
		expect(mockPusher).toHaveBeenCalledOnce();
		expect(mockPusher).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({
					eventType: "support.ticket.created",
					organizationId: "org-1",
					sourceId: "ticket-1",
				}),
			})
		);
	});

	it("flush handles pusher errors gracefully", async () => {
		mockPusher.mockClear();
		mockPusher.mockRejectedValueOnce(new Error("Queue unavailable"));
		const consoleSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		const bus = new EventBus();

		bus.emit({
			type: "booking.cancelled",
			organizationId: "org-1",
			sourceType: "booking",
			sourceId: "b-1",
			payload: {
				bookingId: "b-1",
				boatName: "Boat",
				windowText: "10-12",
			},
			recipients: [{ userId: "u-1", title: "Cancelled" }],
		});

		await bus.flush();

		expect(bus.size).toBe(0);
		expect(consoleSpy).toHaveBeenCalled();

		consoleSpy.mockRestore();
	});
});
