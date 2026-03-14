import { internalServerRouteProcedures } from "@my-app/api/handlers/internal/server-routes";
import { createProcedureClient } from "@orpc/server";
import { Hono } from "hono";

const processPaymentWebhookProcedureClient = createProcedureClient(
	internalServerRouteProcedures.payment.webhookProcess,
);

export const paymentWebhookRoutes = new Hono();

paymentWebhookRoutes.post(
	"/api/payments/webhook/:provider/:type",
	async (c) => {
		const providerName = c.req.param("provider");
		const webhookType = c.req.param("type");
		const result = await processPaymentWebhookProcedureClient({
			providerName,
			webhookType,
			request: c.req.raw,
		});
		return c.json(result.body, result.status);
	},
);
