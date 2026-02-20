import { recurringTaskTickMessageSchema } from "@my-app/api/contracts/recurring-task-queue";
import { processRecurringTaskTick } from "@my-app/api/tasks/recurring";

const MAX_RETRY_ATTEMPTS = 5;

interface QueueProducer {
	send(
		message: unknown,
		options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	): Promise<void>;
}

interface QueueDependencies {
	notificationQueue?: QueueProducer;
	recurringTaskQueue?: QueueProducer;
}

const handleRecurringTaskTick = async (
	queueMessage: Message,
	dependencies: QueueDependencies
) => {
	const parsedMessage = recurringTaskTickMessageSchema.safeParse(
		queueMessage.body
	);
	if (!parsedMessage.success) {
		console.error("Unknown recurring task queue message", queueMessage.body);
		queueMessage.ack();
		return;
	}

	try {
		await processRecurringTaskTick({
			message: parsedMessage.data,
			notificationQueue: dependencies.notificationQueue,
			recurringTaskQueue: dependencies.recurringTaskQueue,
		});
		queueMessage.ack();
	} catch (error) {
		console.error(
			`[task-recurring] failed to process task ${parsedMessage.data.taskId} run ${parsedMessage.data.runNumber}:`,
			error
		);
		if (queueMessage.attempts < MAX_RETRY_ATTEMPTS) {
			queueMessage.retry({
				delaySeconds: Math.min(queueMessage.attempts * 30, 300),
			});
			return;
		}
		queueMessage.ack();
	}
};

export const processRecurringTaskBatch = async (
	batch: MessageBatch<unknown>,
	dependencies: QueueDependencies
) => {
	for (const queueMessage of batch.messages) {
		await handleRecurringTaskTick(queueMessage, dependencies);
	}
};
