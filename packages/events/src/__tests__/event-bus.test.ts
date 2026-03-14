import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearEventPushers,
	EventBus,
	emitDomainEvent,
	registerEventPusher,
} from "../event-bus";
import type { DomainEvent } from "../types";

const makeEvent = (
	overrides?: Partial<DomainEvent<"booking:created">>
): DomainEvent<"booking:created"> => ({
	type: "booking:created",
	organizationId: "org-1",
	idempotencyKey: "idkey-1",
	data: { bookingId: "bk-1", listingId: "ls-1", customerId: "cu-1" },
	...overrides,
});

describe("EventBus", () => {
	beforeEach(() => {
		clearEventPushers();
	});

	it("calls registered pusher when emitting via EventBus", async () => {
		const pusher = vi.fn().mockResolvedValue(undefined);
		registerEventPusher(pusher);

		const bus = new EventBus();
		const event = makeEvent();
		await bus.emit(event);

		expect(pusher).toHaveBeenCalledOnce();
		expect(pusher).toHaveBeenCalledWith(event);
	});

	it("clearEventPushers prevents registered pushers from firing", async () => {
		const pusher = vi.fn().mockResolvedValue(undefined);
		registerEventPusher(pusher);
		clearEventPushers();

		await emitDomainEvent(makeEvent());

		expect(pusher).not.toHaveBeenCalled();
	});

	it("emitDomainEvent calls all registered pushers via Promise.allSettled (all fire even if one throws)", async () => {
		const pusher1 = vi.fn().mockRejectedValue(new Error("pusher1 exploded"));
		const pusher2 = vi.fn().mockResolvedValue(undefined);
		registerEventPusher(pusher1);
		registerEventPusher(pusher2);

		await emitDomainEvent(makeEvent()); // should not throw

		expect(pusher1).toHaveBeenCalledOnce();
		expect(pusher2).toHaveBeenCalledOnce();
	});

	it("multiple pushers all receive the event", async () => {
		const pusher1 = vi.fn().mockResolvedValue(undefined);
		const pusher2 = vi.fn().mockResolvedValue(undefined);
		const pusher3 = vi.fn().mockResolvedValue(undefined);
		registerEventPusher(pusher1);
		registerEventPusher(pusher2);
		registerEventPusher(pusher3);

		const event = makeEvent();
		await emitDomainEvent(event);

		expect(pusher1).toHaveBeenCalledWith(event);
		expect(pusher2).toHaveBeenCalledWith(event);
		expect(pusher3).toHaveBeenCalledWith(event);
	});
});
