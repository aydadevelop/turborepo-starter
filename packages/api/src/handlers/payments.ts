import { notificationsPusher } from "@my-app/notifications/pusher";
import { ORPCError } from "@orpc/server";
import { db } from "@my-app/db";
import {
	connectPaymentProvider,
	getOrgPaymentConfig,
	reconcilePaymentWebhook,
} from "@my-app/payment";

import { organizationPermissionProcedure, publicProcedure } from "../index";
import { getPaymentWebhookAdapter } from "../payments/webhooks";

const PAYMENT_PROVIDERS = ["cloudpayments"] as const;

export const paymentsRouter = {
	providers: publicProcedure.payments.providers.handler(() => {
		return PAYMENT_PROVIDERS.map((provider) => {
			const adapter = getPaymentWebhookAdapter(provider);
			return {
				provider,
				configured: Boolean(adapter),
				supportedWebhookTypes: adapter
					? [...adapter.supportedWebhookTypes]
					: [],
			};
		});
	}),

	createMockChargeNotification: organizationPermissionProcedure({
		payment: ["create"],
		notification: ["create"],
	}).payments.createMockChargeNotification.handler(
		async ({ context, input }) => {
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED");
			}
			const organizationId = context.activeMembership.organizationId;
			const normalizedCurrency = input.currency.toUpperCase();
			const eventIdempotencyKey = [
				"payment.mock.charge",
				organizationId,
				userId ?? "unknown",
				input.amountCents,
				normalizedCurrency,
			]
				.join(":")
				.slice(0, 255);

			const pusherResult = await notificationsPusher({
				input: {
					organizationId,
					actorUserId: userId,
					eventType: "payment.mock.charge.succeeded",
					sourceType: "payment",
					sourceId: crypto.randomUUID(),
					idempotencyKey: eventIdempotencyKey,
					payload: {
						recipients: [
							{
								userId,
								title: `Payment succeeded: ${input.amountCents / 100} ${normalizedCurrency}`,
								body: input.description,
								ctaUrl: "/dashboard",
								channels: ["in_app"],
								severity: "success",
								metadata: {
									amountCents: input.amountCents,
									currency: normalizedCurrency,
								},
							},
						],
					},
				},
				queue: context.notificationQueue,
			});

			return {
				eventIdempotencyKey,
				queued: pusherResult.queued,
			};
		}
	),

	connectProvider: organizationPermissionProcedure({
		payment: ["create"],
	}).payments.connectProvider.handler(async ({ context, input }) => {
		const row = await connectPaymentProvider(
			{
				organizationId: context.activeMembership.organizationId,
				providerConfigId: input.providerConfigId,
				provider: input.provider,
				publicKey: input.publicKey,
				encryptedCredentials: input.encryptedCredentials,
			},
			db,
		);
		return {
			...row,
			publicKey: row.publicKey ?? null,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		};
	}),

	getOrgConfig: organizationPermissionProcedure({
		payment: ["read"],
	}).payments.getOrgConfig.handler(async ({ context }) => {
		const row = await getOrgPaymentConfig(
			context.activeMembership.organizationId,
			db,
		);
		if (!row) return null;
		return {
			...row,
			publicKey: row.publicKey ?? null,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		};
	}),

	receiveWebhook: publicProcedure.payments.receiveWebhook.handler(
		async ({ input }) => {
			try {
				return await reconcilePaymentWebhook(
					input.endpointId,
					input.webhookType,
					input.payload,
					db,
				);
			} catch (e) {
				if (e instanceof Error && e.message === "ENDPOINT_NOT_FOUND") {
					throw new ORPCError("NOT_FOUND", {
						message: "Unknown webhook endpoint",
					});
				}
				throw e;
			}
		},
	),
};
