import { notificationsPusher } from "@my-app/notifications/pusher";

import type { NotificationQueueProducer } from "../context";
import {
	createRecurringTaskTickMessage,
	type RecurringTaskTickMessage,
} from "../contracts/recurring-task-queue";

export interface RecurringTaskQueueProducer {
	send(
		message: unknown,
		options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	): Promise<void>;
}

export interface ScheduleRecurringTaskInput {
	body?: string;
	initialDelaySeconds: number;
	intervalSeconds: number;
	organizationId: string;
	runCount: number;
	severity?: "info" | "success" | "warning" | "error";
	taskId: string;
	title: string;
	userId: string;
}

export const scheduleRecurringTask = async (
	input: ScheduleRecurringTaskInput,
	queue?: RecurringTaskQueueProducer
) => {
	if (!queue) {
		return { queued: false };
	}

	await queue.send(
		createRecurringTaskTickMessage({
			kind: "task.recurring.tick.v1",
			taskId: input.taskId,
			organizationId: input.organizationId,
			userId: input.userId,
			title: input.title,
			body: input.body,
			severity: input.severity ?? "info",
			intervalSeconds: input.intervalSeconds,
			remainingRuns: input.runCount,
			runNumber: 1,
		}),
		{
			contentType: "json",
			delaySeconds: input.initialDelaySeconds,
		}
	);

	return { queued: true };
};

export interface ProcessRecurringTaskTickOptions {
	message: RecurringTaskTickMessage;
	notificationQueue?: NotificationQueueProducer;
	recurringTaskQueue?: RecurringTaskQueueProducer;
}

export const processRecurringTaskTick = async (
	options: ProcessRecurringTaskTickOptions
) => {
	const { message, notificationQueue, recurringTaskQueue } = options;

	await notificationsPusher({
		input: {
			organizationId: message.organizationId,
			eventType: "task.recurring.tick",
			sourceType: "task",
			sourceId: message.taskId,
			idempotencyKey: `task.recurring.tick:${message.taskId}:run:${message.runNumber}`,
			payload: {
				recipients: [
					{
						userId: message.userId,
						title: message.title,
						body: message.body,
						ctaUrl: "/dashboard",
						channels: ["in_app"],
						severity: message.severity,
						metadata: {
							taskId: message.taskId,
							runNumber: message.runNumber,
						},
					},
				],
			},
		},
		queue: notificationQueue,
	});

	if (!recurringTaskQueue || message.remainingRuns <= 1) {
		return;
	}

	await recurringTaskQueue.send(
		createRecurringTaskTickMessage({
			...message,
			remainingRuns: message.remainingRuns - 1,
			runNumber: message.runNumber + 1,
		}),
		{
			contentType: "json",
			delaySeconds: message.intervalSeconds,
		}
	);
};
