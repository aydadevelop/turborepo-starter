import { beforeEach, describe, expect, it, vi } from "vitest";

const processRecurringTaskTickMock = vi.fn();

vi.mock("@my-app/api/tasks/recurring", () => ({
	processRecurringTaskTick: processRecurringTaskTickMock,
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
		queue: "recurring-task-queue",
		retryAll: vi.fn(),
		ackAll: vi.fn(),
	}) as unknown as MessageBatch<unknown>;

describe("processRecurringTaskBatch", () => {
	beforeEach(() => {
		processRecurringTaskTickMock.mockReset();
	});

	it("processes valid task.recurring.tick.v1 messages", async () => {
		processRecurringTaskTickMock.mockResolvedValue(undefined);
		const queueMessage = makeQueueMessage({
			body: {
				kind: "task.recurring.tick.v1",
				taskId: "task-1",
				organizationId: "org-1",
				userId: "user-1",
				title: "Reminder",
				intervalSeconds: 3600,
				remainingRuns: 3,
				runNumber: 1,
			},
		});
		const { processRecurringTaskBatch } = await import(
			"../queues/recurring-task-consumer"
		);

		await processRecurringTaskBatch(makeBatch([queueMessage]), {
			notificationQueue: undefined,
			recurringTaskQueue: undefined,
		});

		expect(processRecurringTaskTickMock).toHaveBeenCalledTimes(1);
		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		expect(queueMessage.retry).not.toHaveBeenCalled();
	});

	it("retries transient failures before max attempts", async () => {
		processRecurringTaskTickMock.mockRejectedValue(
			new Error("temporary failure")
		);
		const queueMessage = makeQueueMessage({
			body: {
				kind: "task.recurring.tick.v1",
				taskId: "task-2",
				organizationId: "org-1",
				userId: "user-1",
				title: "Reminder",
				intervalSeconds: 3600,
				remainingRuns: 3,
				runNumber: 1,
			},
			attempts: 2,
		});
		const { processRecurringTaskBatch } = await import(
			"../queues/recurring-task-consumer"
		);

		await processRecurringTaskBatch(makeBatch([queueMessage]), {
			notificationQueue: undefined,
			recurringTaskQueue: undefined,
		});

		expect(queueMessage.retry).toHaveBeenCalledTimes(1);
		expect(queueMessage.ack).not.toHaveBeenCalled();
	});

	it("acks unknown queue message payloads", async () => {
		const queueMessage = makeQueueMessage({
			body: {
				kind: "unknown.message.v1",
			},
		});
		const { processRecurringTaskBatch } = await import(
			"../queues/recurring-task-consumer"
		);

		await processRecurringTaskBatch(makeBatch([queueMessage]), {
			notificationQueue: undefined,
			recurringTaskQueue: undefined,
		});

		expect(processRecurringTaskTickMock).not.toHaveBeenCalled();
		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		expect(queueMessage.retry).not.toHaveBeenCalled();
	});
});
