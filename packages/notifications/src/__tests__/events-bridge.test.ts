import { clearEventPushers, emitDomainEvent } from "@my-app/events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock notificationsPusher before importing events-bridge
vi.mock("../pusher", () => ({
	notificationsPusher: vi.fn().mockResolvedValue({ idempotent: false, queued: true }),
}));

import { notificationsPusher } from "../pusher";
import { registerNotificationEventPusher } from "../events-bridge";

describe("events-bridge", () => {
	beforeEach(() => {
		clearEventPushers();
		vi.clearAllMocks();
	});

	it("maps booking:created event to notificationsPusher call with matching eventType", async () => {
		registerNotificationEventPusher();

		await emitDomainEvent({
			type: "booking:created",
			organizationId: "org-1",
			idempotencyKey: "idkey-1",
			data: { bookingId: "bk-1", listingId: "ls-1", customerId: "cu-1" },
		});

		expect(notificationsPusher).toHaveBeenCalledOnce();
		const calls = (notificationsPusher as ReturnType<typeof vi.fn>).mock.calls;
		const callArg = calls[0]?.[0] as { input: { eventType: string; organizationId: string } };
		expect(callArg?.input.eventType).toBe("booking:created");
		expect(callArg?.input.organizationId).toBe("org-1");
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

	it("passes the queue from registerNotificationEventPusher to notificationsPusher", async () => {
		const mockQueue = { send: vi.fn() };
		registerNotificationEventPusher(mockQueue);

		await emitDomainEvent({
			type: "payment:captured",
			organizationId: "org-1",
			idempotencyKey: "idkey-3",
			data: { bookingId: "bk-1", paymentId: "pay-1", amountKopeks: 1000 },
		});

		expect(notificationsPusher).toHaveBeenCalledOnce();
		const calls = (notificationsPusher as ReturnType<typeof vi.fn>).mock.calls;
		const callArg = calls[0]?.[0] as { queue: unknown };
		expect(callArg?.queue).toBe(mockQueue);
	});
});
