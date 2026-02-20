import { beforeEach, describe, expect, it, vi } from "vitest";

const notificationsPusherMock = vi.fn();

vi.mock("@my-app/notifications/pusher", () => ({
	notificationsPusher: notificationsPusherMock,
}));

const { createRecurringTaskTickMessage, recurringTaskTickMessageSchema } =
	await import("../contracts/recurring-task-queue");
const { processRecurringTaskTick, scheduleRecurringTask } = await import(
	"../tasks/recurring"
);

const createQueueMock = () => ({
	send: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
	notificationsPusherMock.mockReset();
	notificationsPusherMock.mockResolvedValue({ queued: true });
});

describe("recurring task queue contract", () => {
	it("validates and creates recurring task messages", () => {
		const message = createRecurringTaskTickMessage({
			kind: "task.recurring.tick.v1",
			taskId: "task-1",
			organizationId: "org-1",
			userId: "user-1",
			title: "Reminder",
			severity: "info",
			intervalSeconds: 3600,
			remainingRuns: 3,
			runNumber: 1,
		});

		expect(recurringTaskTickMessageSchema.parse(message)).toEqual(message);
	});
});

describe("scheduleRecurringTask", () => {
	it("returns queued=false when queue is unavailable", async () => {
		const result = await scheduleRecurringTask(
			{
				taskId: "task-1",
				organizationId: "org-1",
				userId: "user-1",
				title: "Reminder",
				initialDelaySeconds: 0,
				intervalSeconds: 3600,
				runCount: 3,
			},
			undefined
		);

		expect(result).toEqual({ queued: false });
	});

	it("queues first recurring tick when queue is available", async () => {
		const queue = createQueueMock();

		const result = await scheduleRecurringTask(
			{
				taskId: "task-1",
				organizationId: "org-1",
				userId: "user-1",
				title: "Reminder",
				initialDelaySeconds: 30,
				intervalSeconds: 3600,
				runCount: 3,
			},
			queue
		);

		expect(result).toEqual({ queued: true });
		expect(queue.send).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "task.recurring.tick.v1",
				taskId: "task-1",
				runNumber: 1,
				remainingRuns: 3,
			}),
			expect.objectContaining({
				delaySeconds: 30,
				contentType: "json",
			})
		);
	});
});

describe("processRecurringTaskTick", () => {
	it("pushes notification and requeues next run", async () => {
		const recurringTaskQueue = createQueueMock();

		await processRecurringTaskTick({
			message: createRecurringTaskTickMessage({
				kind: "task.recurring.tick.v1",
				taskId: "task-1",
				organizationId: "org-1",
				userId: "user-1",
				title: "Reminder",
				severity: "info",
				intervalSeconds: 120,
				remainingRuns: 2,
				runNumber: 1,
			}),
			notificationQueue: undefined,
			recurringTaskQueue,
		});

		expect(notificationsPusherMock).toHaveBeenCalledTimes(1);
		expect(recurringTaskQueue.send).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "task.recurring.tick.v1",
				runNumber: 2,
				remainingRuns: 1,
			}),
			expect.objectContaining({
				delaySeconds: 120,
				contentType: "json",
			})
		);
	});

	it("does not requeue when remainingRuns is 1", async () => {
		const recurringTaskQueue = createQueueMock();

		await processRecurringTaskTick({
			message: createRecurringTaskTickMessage({
				kind: "task.recurring.tick.v1",
				taskId: "task-1",
				organizationId: "org-1",
				userId: "user-1",
				title: "Reminder",
				severity: "info",
				intervalSeconds: 120,
				remainingRuns: 1,
				runNumber: 1,
			}),
			notificationQueue: undefined,
			recurringTaskQueue,
		});

		expect(notificationsPusherMock).toHaveBeenCalledTimes(1);
		expect(recurringTaskQueue.send).not.toHaveBeenCalled();
	});
});
