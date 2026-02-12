import { app } from "./app";
import { processNotificationBatch } from "./queues/notification-consumer";

const notificationsApp: ExportedHandler = {
	fetch: app.fetch,
	queue: async (batch) => {
		await processNotificationBatch(batch);
	},
};

export default notificationsApp;
