import { clearEventPushers, emitDomainEvent } from "@my-app/events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock notificationsPusher before importing events-bridge
vi.mock("../pusher", () => ({
	notificationsPusher: vi.fn().mockResolvedValue({ idempotent: false, queued: true }),
}));

// Mock @my-app/db with a chainable drizzle-like interface
const mockLimit = vi.fn().mockResolvedValue([{ customerUserId: "customer-1", organizationId: "org-1" }]);
vi.mock("@my-app/db", () => ({
	db: {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		limit: mockLimit,
	},
}));

import { notificationsPusher } from "../pusher";
import { registerNotificationEventPusher } from "../events-bridge";

describe("events-bridge", () => {
	beforeEach(() => {
		clearEventPushers();
		vi.clearAllMocks();
		// Reset db mock to return a valid booking row by default
		mockLimit.mockResolvedValue([{ customerUserId: "customer-1", organizationId: "org-1" }]);
	});

	it("resolves booking customerUserId as in-app recipient for booking:confirmed", async () => {
		registerNotificationEventPusher(undefined);

		await emitDomainEvent({
			type: "booking:confirmed",
			organizationId: "org-1",
			idempotencyKey: "idkey-confirmed-1",
			data: { bookingId: "bk-1", ownerId: "org-1" },
		});

		expect(notificationsPusher).toHaveBeenCalledOnce();
		const calls = (notificationsPusher as ReturnType<typeof vi.fn>).mock.calls;
		const callArg = calls[0]?.[0] as { input: { eventType: string; payload: { recipients: Array<{ userId: string }> } } };
		expect(callArg?.input.eventType).toBe("booking:confirmed");
		expect(callArg?.input.payload.recipients[0]?.userId).toBe("customer-1");
	});

	it("does not call notificationsPusher when booking has no customerUserId", async () => {
		mockLimit.mockResolvedValue([{ customerUserId: null, organizationId: "org-1" }]);
		registerNotificationEventPusher(undefined);

		await emitDomainEvent({
			type: "booking:confirmed",
			organizationId: "org-1",
			idempotencyKey: "idkey-confirmed-2",
			data: { bookingId: "bk-no-customer", ownerId: "org-1" },
		});

		expect(notificationsPusher).not.toHaveBeenCalled();
	});

	it("does not call notificationsPusher for silent events (dispute:opened)", async () => {
		registerNotificationEventPusher();

		await emitDomainEvent({
			type: "dispute:opened",
			organizationId: "org-1",
			idempotencyKey: "idkey-2",
			data: { disputeId: "ds-1", bookingId: "bk-1" },
		});

		expect(notificationsPusher).not.toHaveBeenCalled();
	});

	it("does not call notificationsPusher for booking:created (silent event)", async () => {
		registerNotificationEventPusher();

		await emitDomainEvent({
			type: "booking:created",
			organizationId: "org-1",
			idempotencyKey: "idkey-created-1",
			data: { bookingId: "bk-1", listingId: "ls-1", customerId: "cu-1" },
		});

		expect(notificationsPusher).not.toHaveBeenCalled();
	});

	it("passes the queue from registerNotificationEventPusher to notificationsPusher for booking:cancelled", async () => {
		const mockQueue = { send: vi.fn() };
		registerNotificationEventPusher(mockQueue as never);

		await emitDomainEvent({
			type: "booking:cancelled",
			organizationId: "org-1",
			idempotencyKey: "idkey-cancelled-1",
			data: { bookingId: "bk-1", reason: "Customer request", refundAmountKopeks: 0 },
		});

		expect(notificationsPusher).toHaveBeenCalledOnce();
		const calls = (notificationsPusher as ReturnType<typeof vi.fn>).mock.calls;
		const callArg = calls[0]?.[0] as { queue: unknown };
		expect(callArg?.queue).toBe(mockQueue);
	});
});
