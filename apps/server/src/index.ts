import { serve } from "@hono/node-server";
import { RECURRING_TASK_QUEUE, startBoss, stopBoss } from "@my-app/queue";
import { registerWorker } from "@my-app/queue/worker";
import { app } from "./app";
import { registerServerIntegrations } from "./bootstrap";
import { handleRecurringTaskJob } from "./queues/recurring-task-consumer";

const port = Number(process.env.SERVER_PORT ?? process.env.PORT ?? 3000);

registerServerIntegrations();

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`Server listening on http://${info.address}:${info.port}`);
});

// Start queue worker in background (non-blocking)
startBoss()
	.then((boss) =>
		registerWorker(boss, RECURRING_TASK_QUEUE, handleRecurringTaskJob)
	)
	.then(() => console.log("Queue worker started"))
	.catch((err) =>
		console.warn(
			"Queue worker failed to start (DB may be unavailable):",
			err.message
		)
	);

const shutdown = async () => {
	console.log("Shutting down...");
	await stopBoss();
	process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
