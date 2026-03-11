export class WebhookAuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WebhookAuthError";
	}
}

export class WebhookPayloadError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WebhookPayloadError";
	}
}
