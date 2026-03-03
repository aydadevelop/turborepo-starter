import { serve } from "@hono/node-server";
import { NOTIFICATION_QUEUE, startBoss, stopBoss } from "@my-app/queue";
import { registerWorker } from "@my-app/queue/worker";
import { app } from "./app";
import { handleNotificationJob } from "./queues/notification-consumer";

const port = Number(process.env.NOTIFICATIONS_PORT ?? process.env.PORT ?? 3002);

serve({ fetch: app.fetch, port }, (info) => {
	console.log(
		`Notifications server listening on http://localhost:${info.port}`
	);
});

// Start queue worker in background (non-blocking)
startBoss()
	.then((boss) =>
		registerWorker(boss, NOTIFICATION_QUEUE, handleNotificationJob)
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
