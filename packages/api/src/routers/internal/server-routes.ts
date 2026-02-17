import { os } from "@orpc/server";
import { z } from "zod";

import {
	getPaymentWebhookAdapter,
	WebhookAuthError,
	WebhookPayloadError,
} from "../../payments/webhooks";

const serverRouteProcedure = os;

const getCalendarUseCases = () =>
	import("../../calendar/application/calendar-use-cases");

const routeStatusSchema = z.union([
	z.literal(200),
	z.literal(202),
	z.literal(400),
	z.literal(401),
	z.literal(404),
	z.literal(500),
]);

const routeResponseSchema = z.object({
	status: routeStatusSchema,
	body: z.record(z.string(), z.unknown()),
});

const calendarWatchStartInputSchema = z.object({
	connectionId: z.string().trim().min(1),
	webhookUrl: z.url(),
	ttlSeconds: z.number().int().min(60).max(604_800).optional().default(86_400),
	channelToken: z.string().optional(),
});

const calendarWatchStopInputSchema = z.object({
	connectionId: z.string().trim().min(1),
});

const calendarWatchRenewInputSchema = z.object({
	webhookUrl: z.url(),
	ttlSeconds: z.number().int().min(60).max(604_800).optional().default(86_400),
	renewBeforeSeconds: z
		.number()
		.int()
		.min(60)
		.max(604_800)
		.optional()
		.default(21_600),
	channelToken: z.string().optional(),
});

const calendarWebhookDeadLetterListInputSchema = z.object({
	limit: z.number().int().optional(),
});

const processGoogleCalendarWebhookInputSchema = z.object({
	headers: z.instanceof(Headers),
	sharedToken: z.string().optional(),
});

const processPaymentWebhookInputSchema = z.object({
	providerName: z.string().trim().min(1),
	webhookType: z.string().trim().min(1),
	request: z.instanceof(Request),
});

export const internalServerRouteProcedures = {
	calendar: {
		syncGoogle: serverRouteProcedure
			.input(z.void())
			.output(routeResponseSchema)
			.handler(async () => {
				const { syncGoogleCalendar } = await getCalendarUseCases();
				const outcome = await syncGoogleCalendar();
				if (outcome.kind === "error") {
					return { status: 500, body: { error: outcome.message } };
				}
				const { kind: _, ...rest } = outcome;
				return { status: 200, body: { ok: true, ...rest } };
			}),
		watchGoogleStart: serverRouteProcedure
			.input(calendarWatchStartInputSchema)
			.output(routeResponseSchema)
			.handler(async ({ input }) => {
				const { startGoogleWatch } = await getCalendarUseCases();
				const outcome = await startGoogleWatch(input);
				if (outcome.kind === "error") {
					return { status: 500, body: { error: outcome.message } };
				}
				const { kind: _, ...rest } = outcome;
				return { status: 200, body: { ok: true, ...rest } };
			}),
		watchGoogleStop: serverRouteProcedure
			.input(calendarWatchStopInputSchema)
			.output(routeResponseSchema)
			.handler(async ({ input }) => {
				const { stopGoogleWatch } = await getCalendarUseCases();
				const outcome = await stopGoogleWatch(input);
				if (outcome.kind === "error") {
					return { status: 500, body: { error: outcome.message } };
				}
				const { kind: _, ...rest } = outcome;
				return { status: 200, body: { ok: true, ...rest } };
			}),
		watchGoogleRenew: serverRouteProcedure
			.input(calendarWatchRenewInputSchema)
			.output(routeResponseSchema)
			.handler(async ({ input }) => {
				const { renewGoogleWatches } = await getCalendarUseCases();
				const outcome = await renewGoogleWatches(input);
				if (outcome.kind === "error") {
					return { status: 500, body: { error: outcome.message } };
				}
				const { kind: _, ...rest } = outcome;
				return { status: 200, body: { ok: true, ...rest } };
			}),
		webhookGoogleDeadLetterList: serverRouteProcedure
			.input(calendarWebhookDeadLetterListInputSchema)
			.output(routeResponseSchema)
			.handler(async ({ input }) => {
				const { listGoogleDeadLetters } = await getCalendarUseCases();
				const outcome = await listGoogleDeadLetters(input);
				if (outcome.kind === "error") {
					return { status: 500, body: { error: outcome.message } };
				}
				const { kind: _, ...rest } = outcome;
				return { status: 200, body: { ok: true, ...rest } };
			}),
		retryFailedGoogleSyncs: serverRouteProcedure
			.input(z.void())
			.output(routeResponseSchema)
			.handler(async () => {
				const { retryFailedGoogleSyncs } = await getCalendarUseCases();
				const outcome = await retryFailedGoogleSyncs();
				if (outcome.kind === "error") {
					return { status: 500, body: { error: outcome.message } };
				}
				const { kind: _, ...rest } = outcome;
				return { status: 200, body: { ok: true, ...rest } };
			}),
		webhookGoogleIngest: serverRouteProcedure
			.input(processGoogleCalendarWebhookInputSchema)
			.output(routeResponseSchema)
			.handler(async ({ input }) => {
				const { ingestCalendarWebhook } = await getCalendarUseCases();
				const outcome = await ingestCalendarWebhook({
					provider: "google",
					headers: input.headers,
					sharedToken: input.sharedToken,
				});

				switch (outcome.kind) {
					case "adapter_not_configured":
						return {
							status: 202,
							body: { ok: true, skipped: "google_adapter_not_configured" },
						};
					case "missing_headers":
						return {
							status: 202,
							body: { ok: true, skipped: "missing_required_headers" },
						};
					case "unauthorized":
						return {
							status: 401,
							body: { error: "Unauthorized webhook token" },
						};
					case "duplicate":
						return {
							status: 200,
							body: {
								ok: true,
								matched: outcome.matched,
								duplicate: true,
								webhookEventId: outcome.webhookEventId,
								previousStatus: outcome.previousStatus,
							},
						};
					default:
						return {
							status: 202,
							body: {
								ok: true,
								matched: outcome.matched,
								duplicate: false,
								webhookEventId: outcome.webhookEventId,
								connectionId: outcome.connectionId,
								provider: outcome.provider,
								processedEvents: outcome.processedEvents,
								nextSyncToken: outcome.nextSyncToken,
								recoveredFromExpiredToken: outcome.recoveredFromExpiredToken,
							},
						};
				}
			}),
	},
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
					adapter.authenticateWebhook(request);
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

				try {
					const result = await adapter.processWebhook(
						input.webhookType,
						payload
					);
					return {
						status: 200,
						body: {
							...result,
						},
					};
				} catch (error) {
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
