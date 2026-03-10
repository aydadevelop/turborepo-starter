import { serve } from "@hono/node-server";
import { db } from "@my-app/db";
import {
	GoogleCalendarAdapter,
	registerBookingLifecycleSync,
	registerCalendarAdapter,
} from "@my-app/calendar";
import { registerNotificationEventPusher } from "@my-app/notifications/events-bridge";
import { RECURRING_TASK_QUEUE, startBoss, stopBoss } from "@my-app/queue";
import { registerWorker } from "@my-app/queue/worker";
import { app } from "./app";
import { handleRecurringTaskJob } from "./queues/recurring-task-consumer";

const port = Number(process.env.SERVER_PORT ?? process.env.PORT ?? 3000);

// Register external integrations before starting the HTTP server
const googleServiceAccountKey: Record<string, unknown> = (() => {
	try {
		return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "{}") as Record<string, unknown>;
	} catch {
		return {};
	}
})();
registerCalendarAdapter("google", new GoogleCalendarAdapter(googleServiceAccountKey));
registerBookingLifecycleSync(db);
registerNotificationEventPusher(undefined, db);

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
