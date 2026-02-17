import { app } from "./app";
import { processBookingLifecycleBatch } from "./queues/booking-lifecycle-consumer";

interface Env {
	NOTIFICATION_QUEUE?: {
		send(
			message: unknown,
			options?: {
				contentType?: "text" | "bytes" | "json" | "v8";
				delaySeconds?: number;
			}
		): Promise<void>;
	};
	BOOKING_LIFECYCLE_QUEUE?: {
		send(
			message: unknown,
			options?: {
				contentType?: "text" | "bytes" | "json" | "v8";
				delaySeconds?: number;
			}
		): Promise<void>;
	};
}

const serverApp: ExportedHandler<Env> = {
	fetch: app.fetch,
	queue: async (batch) => {
		await processBookingLifecycleBatch(batch);
	},
};

export default serverApp;
