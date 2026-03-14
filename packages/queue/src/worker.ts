import type { PgBoss } from "pg-boss";

export interface WorkerOptions {
	/** Number of jobs fetched per poll (default: 10) */
	batchSize?: number;
	/** Number of concurrent workers (default: 2) */
	localConcurrency?: number;
}

/**
 * Register a pg-boss worker for a queue.
 * Jobs are processed in batches. Throwing an error will trigger pg-boss retry.
 */
export async function registerWorker<T extends object>(
	boss: PgBoss,
	queueName: string,
	handler: (data: T) => Promise<void>,
	options?: WorkerOptions,
): Promise<string> {
	await boss.createQueue(`${queueName}-dlq`);

	await boss.createQueue(queueName, {
		retryLimit: 5,
		retryBackoff: true,
		retryDelay: 30,
		deadLetter: `${queueName}-dlq`,
	});

	return boss.work<T>(
		queueName,
		{
			localConcurrency: options?.localConcurrency ?? 2,
			batchSize: options?.batchSize ?? 10,
		},
		async (jobs) => {
			for (const job of jobs) {
				await handler(job.data);
			}
		},
	);
}
