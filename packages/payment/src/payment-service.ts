import {
	booking,
	bookingPaymentAttempt,
	organizationPaymentConfig,
	paymentWebhookEvent,
} from "@my-app/db/schema/marketplace";
import type { EventBus } from "@my-app/events";
import { and, eq, sql } from "drizzle-orm";
import type {
	ConnectPaymentProviderInput,
	Db,
	OrgPaymentConfigRow,
	ReconcileWebhookResult,
} from "./types";

interface PaymentMutationContext {
	actorUserId?: string;
	eventBus?: EventBus;
}

const emitPaymentConfigReadinessChanged = async (
	organizationId: string,
	configId: string,
	isReady: boolean,
	context?: PaymentMutationContext
): Promise<void> => {
	if (!context?.eventBus) {
		return;
	}

	await context.eventBus.emit({
		type: "payment:organization-config-readiness-changed",
		organizationId,
		actorUserId: context.actorUserId,
		idempotencyKey: `payment:readiness:${organizationId}:${configId}:${isReady ? "ready" : "not-ready"}`,
		data: {
			configId,
			isReady,
		},
	});
};

export async function connectPaymentProvider(
	input: ConnectPaymentProviderInput,
	db: Db,
	context?: PaymentMutationContext
): Promise<OrgPaymentConfigRow> {
	const webhookEndpointId = crypto.randomUUID();
	const id = crypto.randomUUID();

	const [row] = await db
		.insert(organizationPaymentConfig)
		.values({
			id,
			organizationId: input.organizationId,
			providerConfigId: input.providerConfigId,
			provider: input.provider,
			publicKey: input.publicKey,
			encryptedCredentials: input.encryptedCredentials,
			webhookEndpointId,
			validationStatus: "pending",
			isActive: false,
		})
		.onConflictDoUpdate({
			target: [
				organizationPaymentConfig.organizationId,
				organizationPaymentConfig.provider,
			],
			set: {
				publicKey: input.publicKey,
				encryptedCredentials: input.encryptedCredentials,
				validationStatus: "pending",
				updatedAt: sql`now()`,
			},
		})
		.returning();

	if (!row) {
		throw new Error("UPSERT_FAILED");
	}

	await emitPaymentConfigReadinessChanged(
		input.organizationId,
		row.id,
		false,
		context
	);

	return row;
}

export async function getOrgPaymentConfig(
	organizationId: string,
	db: Db
): Promise<OrgPaymentConfigRow | null> {
	const [row] = await db
		.select()
		.from(organizationPaymentConfig)
		.where(eq(organizationPaymentConfig.organizationId, organizationId))
		.limit(1);

	return row ?? null;
}

export async function reconcilePaymentWebhook(
	endpointId: string,
	webhookType: string,
	payload: Record<string, unknown>,
	db: Db,
	context?: PaymentMutationContext
): Promise<ReconcileWebhookResult> {
	// 1. Verify endpoint belongs to a known org config
	const [config] = await db
		.select()
		.from(organizationPaymentConfig)
		.where(eq(organizationPaymentConfig.webhookEndpointId, endpointId))
		.limit(1);

	if (!config) {
		throw new Error("ENDPOINT_NOT_FOUND");
	}

	const transactionId = String(payload.TransactionId ?? "");
	const invoiceId = payload.InvoiceId ? String(payload.InvoiceId) : null;
	const idempotencyKey = `${endpointId}:${webhookType}:${transactionId}`;

	// 2. Idempotency check — look for existing processed event for this transaction + type
	const [existingEvent] = await db
		.select({ id: paymentWebhookEvent.id, status: paymentWebhookEvent.status })
		.from(paymentWebhookEvent)
		.where(
			and(
				eq(paymentWebhookEvent.requestSignature, idempotencyKey),
				eq(paymentWebhookEvent.status, "processed")
			)
		)
		.limit(1);

	if (existingEvent?.status === "processed") {
		return {
			processed: false,
			idempotent: true,
			bookingId: invoiceId,
			organizationId: config.organizationId,
		};
	}

	// 3. Insert webhook event record
	const eventId = crypto.randomUUID();
	await db.insert(paymentWebhookEvent).values({
		id: eventId,
		organizationId: config.organizationId,
		endpointId,
		provider: config.provider,
		webhookType: webhookType as
			| "check"
			| "pay"
			| "fail"
			| "confirm"
			| "refund"
			| "cancel",
		status: "received",
		requestSignature: idempotencyKey,
		payload,
	});

	// 4. Reconcile booking state based on webhook type
	if (invoiceId && (webhookType === "pay" || webhookType === "confirm")) {
		const amountCents = Math.round(Number(payload.Amount ?? 0) * 100);
		const currency = String(payload.Currency ?? "RUB");
		const attemptIdempotencyKey = `webhook:${endpointId}:${transactionId}`;

		await db
			.insert(bookingPaymentAttempt)
			.values({
				id: crypto.randomUUID(),
				bookingId: invoiceId,
				organizationId: config.organizationId,
				provider: config.provider,
				idempotencyKey: attemptIdempotencyKey,
				providerIntentId: transactionId,
				status: "captured",
				amountCents,
				currency,
				processedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [
					bookingPaymentAttempt.provider,
					bookingPaymentAttempt.providerIntentId,
				],
				set: {
					status: "captured",
					processedAt: new Date(),
					updatedAt: sql`now()`,
				},
			});

		await db
			.update(booking)
			.set({ paymentStatus: "paid", updatedAt: sql`now()` })
			.where(eq(booking.id, invoiceId));
	} else if (invoiceId && webhookType === "fail") {
		const attemptIdempotencyKey = `webhook:${endpointId}:${transactionId}`;
		await db
			.insert(bookingPaymentAttempt)
			.values({
				id: crypto.randomUUID(),
				bookingId: invoiceId,
				organizationId: config.organizationId,
				provider: config.provider,
				idempotencyKey: attemptIdempotencyKey,
				providerIntentId: transactionId,
				status: "failed",
				amountCents: 0,
				currency: "RUB",
				failureReason: String(
					payload.ReasonCode ?? payload.Reason ?? "unknown"
				),
			})
			.onConflictDoUpdate({
				target: [
					bookingPaymentAttempt.provider,
					bookingPaymentAttempt.providerIntentId,
				],
				set: {
					status: "failed",
					failureReason: String(
						payload.ReasonCode ?? payload.Reason ?? "unknown"
					),
					updatedAt: sql`now()`,
				},
			});

		await db
			.update(booking)
			.set({ paymentStatus: "failed", updatedAt: sql`now()` })
			.where(eq(booking.id, invoiceId));
	} else if (invoiceId && webhookType === "refund") {
		const refundAmountCents = Math.round(Number(payload.Amount ?? 0) * 100);
		await db
			.update(booking)
			.set({
				paymentStatus: "refunded",
				refundAmountCents,
				updatedAt: sql`now()`,
			})
			.where(eq(booking.id, invoiceId));
	}

	// 5. Mark event as processed
	await db
		.update(paymentWebhookEvent)
		.set({ status: "processed", responseCode: 0, updatedAt: sql`now()` })
		.where(eq(paymentWebhookEvent.id, eventId));

	if (
		config.validationStatus !== "validated" ||
		!config.isActive ||
		!config.validatedAt
	) {
		await db
			.update(organizationPaymentConfig)
			.set({
				validationStatus: "validated",
				validatedAt: config.validatedAt ?? new Date(),
				isActive: true,
				updatedAt: sql`now()`,
			})
			.where(eq(organizationPaymentConfig.id, config.id));

		await emitPaymentConfigReadinessChanged(
			config.organizationId,
			config.id,
			true,
			context
		);
	}

	return {
		processed: true,
		idempotent: false,
		bookingId: invoiceId,
		organizationId: config.organizationId,
	};
}
