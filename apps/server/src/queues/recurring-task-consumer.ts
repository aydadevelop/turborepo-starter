import { processRecurringTaskTick } from "@my-app/api/tasks/recurring";
import { recurringTaskTickMessageSchema } from "@my-app/api-contract/contracts/recurring-task-queue";
import { NOTIFICATION_QUEUE, RECURRING_TASK_QUEUE } from "@my-app/queue";
import { createPgBossProducer } from "@my-app/queue/producer";

export const handleRecurringTaskJob = async (data: unknown): Promise<void> => {
	const parsed = recurringTaskTickMessageSchema.safeParse(data);
	if (!parsed.success) {
		console.error("Unknown recurring task queue message", data);
		return; // discard malformed messages
	}

	await processRecurringTaskTick({
		message: parsed.data,
		notificationQueue: createPgBossProducer(NOTIFICATION_QUEUE),
		recurringTaskQueue: createPgBossProducer(RECURRING_TASK_QUEUE),
	});
};
