import { os } from "@orpc/server";
import { db } from "@my-app/db";
import { reconcilePaymentWebhook } from "@my-app/payment";
import { z } from "zod";

import {
	getPaymentWebhookAdapter,
	WebhookAuthError,
	WebhookPayloadError,
} from "../../payments/webhooks";

const serverRouteProcedure = os;

const routeStatusSchema = z.union([
	z.literal(200),
	z.literal(400),
	z.literal(401),
	z.literal(404),
	z.literal(500),
]);

const routeResponseSchema = z.object({
	status: routeStatusSchema,
	body: z.record(z.string(), z.unknown()),
});

const processPaymentWebhookInputSchema = z.object({
	providerName: z.string().trim().min(1),
	webhookType: z.string().trim().min(1),
	request: z.custom<Request>((val) => val instanceof Request),
});

const resolveEndpointId = (request: Request): string | null => {
	const headerEndpointId = request.headers.get("x-endpoint-id")?.trim();

	try {
		const endpointId = new URL(request.url).searchParams.get("endpointId")?.trim();
		return endpointId || headerEndpointId || null;
	} catch {
		return headerEndpointId || null;
	}
};

export const internalServerRouteProcedures = {
	payment: {
		webhookProcess: serverRouteProcedure
			.input(processPaymentWebhookInputSchema)
			.output(routeResponseSchema)
			.handler(async ({ input }) => {
				const request = input.request as Request;
				const adapter = getPaymentWebhookAdapter(input.providerName);
				if (!adapter) {
					return {
						status: 404,
						body: {
							error: "Unknown payment provider",
						},
					};
				}

				if (!adapter.supportedWebhookTypes.has(input.webhookType)) {
					return {
						status: 404,
						body: {
							error: "Unknown webhook type",
						},
					};
				}

				try {
					await adapter.authenticateWebhook(request);
				} catch (error) {
					if (error instanceof WebhookAuthError) {
						return {
							status: 401,
							body: {
								error: "Unauthorized",
							},
						};
					}

					throw error;
				}

				let payload: unknown;
				try {
					payload = await adapter.parseWebhookBody(request);
				} catch (error) {
					if (error instanceof WebhookPayloadError) {
						return {
							status: 400,
							body: {
								error: error.message,
							},
						};
					}

					console.error(
						`[PaymentWebhook] Failed to parse ${input.providerName} body`,
						error
					);

					return {
						status: 400,
						body: {
							error: "Invalid request body",
						},
					};
				}

				const endpointId = resolveEndpointId(request);
				if (!endpointId) {
					return {
						status: 400,
						body: {
							error:
								"Missing endpointId query param or x-endpoint-id header",
						},
					};
				}

				try {
					await reconcilePaymentWebhook(
						endpointId,
						input.webhookType,
						payload as Record<string, unknown>,
						db,
					);
					return {
						status: 200,
						body: {
							code: 0,
						},
					};
				} catch (error) {
					if (
						error instanceof Error &&
						error.message === "ENDPOINT_NOT_FOUND"
					) {
						return {
							status: 404,
							body: {
								error: "Unknown webhook endpoint",
							},
						};
					}

					console.error(
						`[PaymentWebhook] Error processing ${input.providerName}/${input.webhookType}`,
						error
					);

					return {
						status: 500,
						body: {
							code: 1,
						},
					};
				}
			}),
	},
};
