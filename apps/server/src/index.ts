import { app } from "./app";

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
}

const serverApp: ExportedHandler<Env> = {
	fetch: app.fetch,
};

export default serverApp;
