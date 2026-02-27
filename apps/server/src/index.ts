import { app } from "./app";
import { processRecurringTaskBatch } from "./queues/recurring-task-consumer";

interface QueueProducer {
	send(
		message: unknown,
		options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	): Promise<void>;
}

interface Env {
	NOTIFICATION_QUEUE?: QueueProducer;
	RECURRING_TASK_QUEUE?: QueueProducer;
}

const serverApp: ExportedHandler<Env> = {
	fetch: app.fetch,
	queue: async (batch, env) => {
		await processRecurringTaskBatch(batch, {
			notificationQueue: env.NOTIFICATION_QUEUE,
			recurringTaskQueue: env.RECURRING_TASK_QUEUE,
		});
	},
};

export default serverApp;
