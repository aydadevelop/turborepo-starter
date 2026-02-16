import {
	WebhookAuthError,
	WebhookPayloadError,
	getPaymentWebhookAdapter,
} from "@full-stack-cf-app/api/payments/webhooks";
import { Hono } from "hono";

export const paymentWebhookRoutes = new Hono();

paymentWebhookRoutes.post(
	"/api/payments/webhook/:provider/:type",
	async (c) => {
		const providerName = c.req.param("provider");
		const webhookType = c.req.param("type");

		const adapter = getPaymentWebhookAdapter(providerName);
		if (!adapter) {
			return c.json({ error: "Unknown payment provider" }, 404);
		}

		if (!adapter.supportedWebhookTypes.has(webhookType)) {
			return c.json({ error: "Unknown webhook type" }, 404);
		}

		// Authenticate
		try {
			adapter.authenticateWebhook(c.req.raw);
		} catch (error) {
			if (error instanceof WebhookAuthError) {
				return c.json({ error: "Unauthorized" }, 401);
			}
			throw error;
		}

		// Parse body
		let payload: unknown;
		try {
			payload = await adapter.parseWebhookBody(c.req.raw);
		} catch (error) {
			if (error instanceof WebhookPayloadError) {
				return c.json({ error: (error as WebhookPayloadError).message }, 400);
			}
			console.error(
				`[PaymentWebhook] Failed to parse ${providerName} body`,
				error
			);
			return c.json({ error: "Invalid request body" }, 400);
		}

		// Process
		try {
			const result = await adapter.processWebhook(webhookType, payload);
			return c.json(result, 200);
		} catch (error) {
			console.error(
				`[PaymentWebhook] Error processing ${providerName}/${webhookType}`,
				error
			);
			return c.json({ code: 1 }, 500);
		}
	}
);
