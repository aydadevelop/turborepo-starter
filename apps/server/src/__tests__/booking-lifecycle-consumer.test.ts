import { beforeEach, describe, expect, it, vi } from "vitest";

const expireBookingIfUnpaidMock = vi.fn();

vi.mock("@full-stack-cf-app/api/routers/booking/services/expiration", () => ({
	expireBookingIfUnpaid: expireBookingIfUnpaidMock,
}));

const makeQueueMessage = (params: { body: unknown; attempts?: number }) => {
	const ack = vi.fn();
	const retry = vi.fn();
	return {
		body: params.body,
		attempts: params.attempts ?? 1,
		ack,
		retry,
	} as unknown as Message & {
		ack: ReturnType<typeof vi.fn>;
		retry: ReturnType<typeof vi.fn>;
	};
};

const makeBatch = (messages: Message[]): MessageBatch<unknown> =>
	({
		messages,
		queue: "booking-lifecycle-queue",
		retryAll: vi.fn(),
		ackAll: vi.fn(),
	}) as unknown as MessageBatch<unknown>;

describe("processBookingLifecycleBatch", () => {
	beforeEach(() => {
		expireBookingIfUnpaidMock.mockReset();
	});

	it("expires eligible booking on booking.expiration.check.v1 messages", async () => {
		expireBookingIfUnpaidMock.mockResolvedValue({
			expired: true,
			reason: "expired",
		});
		const queueMessage = makeQueueMessage({
			body: {
				kind: "booking.expiration.check.v1",
				bookingId: "booking-1",
			},
		});
		const { processBookingLifecycleBatch } = await import(
			"../queues/booking-lifecycle-consumer"
		);

		await processBookingLifecycleBatch(makeBatch([queueMessage]));

		expect(expireBookingIfUnpaidMock).toHaveBeenCalledWith("booking-1");
		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		expect(queueMessage.retry).not.toHaveBeenCalled();
	});

	it("retries transient failures before max attempts", async () => {
		expireBookingIfUnpaidMock.mockRejectedValue(new Error("temporary failure"));
		const queueMessage = makeQueueMessage({
			body: {
				kind: "booking.expiration.check.v1",
				bookingId: "booking-2",
			},
			attempts: 2,
		});
		const { processBookingLifecycleBatch } = await import(
			"../queues/booking-lifecycle-consumer"
		);

		await processBookingLifecycleBatch(makeBatch([queueMessage]));

		expect(queueMessage.retry).toHaveBeenCalledTimes(1);
		expect(queueMessage.ack).not.toHaveBeenCalled();
	});

	it("acks unknown queue message payloads", async () => {
		const queueMessage = makeQueueMessage({
			body: {
				kind: "unknown.message.v1",
			},
		});
		const { processBookingLifecycleBatch } = await import(
			"../queues/booking-lifecycle-consumer"
		);

		await processBookingLifecycleBatch(makeBatch([queueMessage]));

		expect(expireBookingIfUnpaidMock).not.toHaveBeenCalled();
		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		expect(queueMessage.retry).not.toHaveBeenCalled();
	});
});
