import { beforeEach, describe, expect, it, vi } from "vitest";

const processRecurringTaskTickMock = vi.fn();

vi.mock("@my-app/api/tasks/recurring", () => ({
	processRecurringTaskTick: processRecurringTaskTickMock,
}));

vi.mock("@my-app/queue/producer", () => ({
	createPgBossProducer: vi.fn((queueName: string) => ({
		send: vi.fn(),
		queueName,
	})),
}));

describe("handleRecurringTaskJob", () => {
	beforeEach(() => {
		processRecurringTaskTickMock.mockReset();
	});

	it("processes valid task.recurring.tick.v1 messages", async () => {
		processRecurringTaskTickMock.mockResolvedValue(undefined);
		const { handleRecurringTaskJob } = await import(
			"../queues/recurring-task-consumer"
		);

		await handleRecurringTaskJob({
			kind: "task.recurring.tick.v1",
			taskId: "task-1",
			organizationId: "org-1",
			userId: "user-1",
			title: "Reminder",
			intervalSeconds: 3600,
			remainingRuns: 3,
			runNumber: 1,
		});

		expect(processRecurringTaskTickMock).toHaveBeenCalledTimes(1);
	});

	it("discards unknown message payloads", async () => {
		const { handleRecurringTaskJob } = await import(
			"../queues/recurring-task-consumer"
		);

		await handleRecurringTaskJob({
			kind: "unknown.message.v1",
		});

		expect(processRecurringTaskTickMock).not.toHaveBeenCalled();
	});
});
