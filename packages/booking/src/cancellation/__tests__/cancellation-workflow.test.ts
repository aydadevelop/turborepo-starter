import { organization, user } from "@my-app/db/schema/auth";
import {
	booking,
	bookingCancellationRequest,
	bookingPaymentAttempt,
	bookingRefund,
	listing,
	listingPublication,
	listingTypeConfig,
	organizationPaymentConfig,
	paymentProviderConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import {
	clearEventPushers,
	EventBus,
	registerEventPusher,
} from "@my-app/events";
import {
	type PaymentProvider,
	registerPaymentProvider,
	resetPaymentProviderRegistry,
} from "@my-app/payment";
import type { WorkflowContext } from "@my-app/workflows";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../types";
import { processCancellationWorkflow } from "../cancellation-workflow";

const ORG_ID = "disp-org-1";
const USER_ID = "disp-user-1";
const LISTING_TYPE_ID = "disp-listing-type-1";
const PROVIDER_CONFIG_ID = "disp-provider-config-1";
const ORG_PAYMENT_CONFIG_ID = "disp-org-payment-config-1";
const LISTING_ID = "disp-listing-1";
const PUBLICATION_ID = "disp-publication-1";
const BOOKING_ID = "disp-booking-1";
const REQUEST_ID = "disp-request-1";
const NOW = new Date("2026-03-10T12:00:00.000Z");
const FUTURE_START = new Date("2026-03-25T12:00:00.000Z");
const FUTURE_END = new Date("2026-03-25T16:00:00.000Z");

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeAll",
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Disputes Org",
			slug: "disputes-org",
			createdAt: NOW,
		});

		await db.insert(user).values({
			id: USER_ID,
			name: "Disputes User",
			email: "disputes@example.com",
			emailVerified: true,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(listingTypeConfig).values({
			id: LISTING_TYPE_ID,
			slug: LISTING_TYPE_ID,
			label: "Vessel",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(paymentProviderConfig).values({
			id: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			displayName: "CloudPayments",
			supportedCurrencies: ["RUB"],
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(organizationPaymentConfig).values({
			id: ORG_PAYMENT_CONFIG_ID,
			organizationId: ORG_ID,
			providerConfigId: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			publicKey: "pk_live_test",
			encryptedCredentials: JSON.stringify({ apiSecret: "secret_live_test" }),
			credentialKeyVersion: 1,
			validationStatus: "validated",
			isActive: true,
			validatedAt: NOW,
			webhookEndpointId: "disp-webhook-endpoint-1",
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_ID,
			name: "Disputes Listing",
			slug: "disputes-listing",
			status: "active",
			isActive: true,
			minimumDurationMinutes: 120,
			minimumNoticeMinutes: 60,
			timezone: "UTC",
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(listingPublication).values({
			id: PUBLICATION_ID,
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			channelType: "own_site",
			isActive: true,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(booking).values({
			id: BOOKING_ID,
			organizationId: ORG_ID,
			listingId: LISTING_ID,
			publicationId: PUBLICATION_ID,
			merchantOrganizationId: ORG_ID,
			merchantPaymentConfigId: ORG_PAYMENT_CONFIG_ID,
			customerUserId: USER_ID,
			source: "web",
			status: "confirmed",
			paymentStatus: "paid",
			calendarSyncStatus: "not_applicable",
			startsAt: FUTURE_START,
			endsAt: FUTURE_END,
			basePriceCents: 10_000,
			totalPriceCents: 10_000,
			currency: "RUB",
			createdAt: NOW,
			updatedAt: NOW,
		});
	},
});

const getDb = () => dbState.db as unknown as Db;

const makeCtx = (
	overrides: Partial<WorkflowContext> = {},
): WorkflowContext => ({
	organizationId: ORG_ID,
	actorUserId: USER_ID,
	idempotencyKey: "wf-cancellation-1",
	eventBus: new EventBus(),
	...overrides,
});

const registerTestProvider = (
	overrides: Partial<PaymentProvider> = {},
): PaymentProvider => {
	const provider: PaymentProvider = {
		providerId: "cloudpayments",
		refundPayment: vi
			.fn()
			.mockResolvedValue({ externalRefundId: "cp-refund-1" }),
		...overrides,
	};

	registerPaymentProvider(provider);
	return provider;
};

const insertCancellationRequest = async (
	db: Db,
	overrides: Partial<typeof bookingCancellationRequest.$inferInsert> = {},
): Promise<void> => {
	await db.insert(bookingCancellationRequest).values({
		id: REQUEST_ID,
		bookingId: BOOKING_ID,
		organizationId: ORG_ID,
		requestedByUserId: USER_ID,
		initiatedByRole: "manager",
		status: "requested",
		reason: "Operator approved cancellation",
		reasonCode: "OWNER_OPERATIONAL_ISSUE",
		bookingTotalPriceCents: 10_000,
		penaltyAmountCents: 5000,
		refundAmountCents: 5000,
		currency: "RUB",
		requestedAt: NOW,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	});
};

const insertCapturedAttempt = async (
	db: Db,
	overrides: Partial<typeof bookingPaymentAttempt.$inferInsert> = {},
): Promise<void> => {
	await db.insert(bookingPaymentAttempt).values({
		id: "disp-payment-attempt-1",
		bookingId: BOOKING_ID,
		organizationId: ORG_ID,
		provider: "cloudpayments",
		idempotencyKey: "disp-payment-attempt-1",
		providerIntentId: "455",
		status: "captured",
		amountCents: 10_000,
		currency: "RUB",
		processedAt: NOW,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	});
};

beforeEach(() => {
	resetPaymentProviderRegistry();
	clearEventPushers();
});

describe("processCancellationWorkflow", () => {
	it("loads the stored snapshot, executes the refund, persists processed refund state, updates booking/request state, and emits booking:cancelled", async () => {
		const db = getDb();
		const provider = registerTestProvider();
		const pusher = vi.fn().mockResolvedValue(undefined);
		registerEventPusher(pusher);

		await insertCancellationRequest(db);
		await insertCapturedAttempt(db);

		const workflow = processCancellationWorkflow(db);
		const result = await workflow.execute(
			{
				requestId: REQUEST_ID,
				organizationId: ORG_ID,
				appliedByUserId: USER_ID,
			},
			makeCtx(),
		);

		expect(result.success).toBe(true);
		if (!result.success) {
			throw result.error;
		}

		expect(provider.refundPayment).toHaveBeenCalledWith(
			expect.objectContaining({
				amountCents: 5000,
				providerPaymentId: "455",
				currency: "RUB",
			}),
			expect.objectContaining({
				providerId: "cloudpayments",
				publicKey: "pk_live_test",
				credentials: expect.objectContaining({ apiSecret: "secret_live_test" }),
			}),
		);

		const [refund] = await db
			.select()
			.from(bookingRefund)
			.where(eq(bookingRefund.bookingId, BOOKING_ID))
			.limit(1);
		expect(refund).toMatchObject({
			status: "processed",
			externalRefundId: "cp-refund-1",
			amountCents: 5000,
			provider: "cloudpayments",
		});

		const [updatedBooking] = await db
			.select()
			.from(booking)
			.where(eq(booking.id, BOOKING_ID))
			.limit(1);
		expect(updatedBooking).toMatchObject({
			status: "cancelled",
			refundAmountCents: 5000,
		});

		const [updatedRequest] = await db
			.select()
			.from(bookingCancellationRequest)
			.where(eq(bookingCancellationRequest.id, REQUEST_ID))
			.limit(1);
		expect(updatedRequest).toMatchObject({
			status: "applied",
			appliedByUserId: USER_ID,
			refundStatus: "processed",
			refundReference: "cp-refund-1",
		});

		expect(pusher).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "booking:cancelled",
				organizationId: ORG_ID,
				actorUserId: USER_ID,
				data: expect.objectContaining({
					bookingId: BOOKING_ID,
					reason: "Operator approved cancellation",
					refundAmountKopeks: 5000,
				}),
			}),
			undefined,
		);
		expect(pusher).toHaveBeenCalledTimes(1);
	});

	it("skips provider execution for zero-refund requests but still applies the cancellation snapshot", async () => {
		const db = getDb();
		const provider = registerTestProvider();

		await insertCancellationRequest(db, {
			refundAmountCents: 0,
			penaltyAmountCents: 10_000,
			reason: "Non-refundable cancellation",
			reasonCode: "CUSTOMER_CHANGED_PLANS",
		});

		const workflow = processCancellationWorkflow(db);
		const result = await workflow.execute(
			{
				requestId: REQUEST_ID,
				organizationId: ORG_ID,
				appliedByUserId: USER_ID,
			},
			makeCtx(),
		);

		expect(result.success).toBe(true);
		expect(provider.refundPayment).not.toHaveBeenCalled();

		const refunds = await db
			.select()
			.from(bookingRefund)
			.where(eq(bookingRefund.bookingId, BOOKING_ID));
		expect(refunds).toHaveLength(0);

		const [updatedBooking] = await db
			.select()
			.from(booking)
			.where(eq(booking.id, BOOKING_ID))
			.limit(1);
		expect(updatedBooking).toMatchObject({
			status: "cancelled",
			refundAmountCents: 0,
		});

		const [updatedRequest] = await db
			.select()
			.from(bookingCancellationRequest)
			.where(eq(bookingCancellationRequest.id, REQUEST_ID))
			.limit(1);
		expect(updatedRequest).toMatchObject({
			status: "applied",
			appliedByUserId: USER_ID,
		});
	});

	it("marks the refund row rejected and restores booking/request state when a downstream step fails after provider execution", async () => {
		const db = getDb();
		registerTestProvider();

		await insertCancellationRequest(db);
		await insertCapturedAttempt(db);

		const workflow = processCancellationWorkflow(db);
		const failingBus = {
			emit: vi.fn().mockRejectedValue(new Error("event bus unavailable")),
		} as unknown as EventBus;

		const result = await workflow.execute(
			{
				requestId: REQUEST_ID,
				organizationId: ORG_ID,
				appliedByUserId: USER_ID,
			},
			makeCtx({ eventBus: failingBus }),
		);

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error("Expected workflow failure");
		}

		const [refund] = await db
			.select()
			.from(bookingRefund)
			.where(eq(bookingRefund.bookingId, BOOKING_ID))
			.limit(1);
		expect(refund).toMatchObject({
			status: "rejected",
			externalRefundId: "cp-refund-1",
		});

		const [restoredBooking] = await db
			.select()
			.from(booking)
			.where(eq(booking.id, BOOKING_ID))
			.limit(1);
		expect(restoredBooking).toMatchObject({
			status: "confirmed",
			refundAmountCents: 0,
		});

		const [restoredRequest] = await db
			.select()
			.from(bookingCancellationRequest)
			.where(eq(bookingCancellationRequest.id, REQUEST_ID))
			.limit(1);
		expect(restoredRequest).toMatchObject({
			status: "requested",
			refundStatus: null,
			refundReference: null,
		});
	});

	it("treats the stored request snapshot as authoritative even if booking dates change after request creation", async () => {
		const db = getDb();
		const provider = registerTestProvider();

		await insertCancellationRequest(db, {
			refundAmountCents: 2500,
			penaltyAmountCents: 7500,
			reason: "Snapshot should win",
		});
		await insertCapturedAttempt(db, { amountCents: 10_000 });

		await db
			.update(booking)
			.set({
				startsAt: new Date("2026-03-10T13:00:00.000Z"),
				endsAt: new Date("2026-03-10T14:00:00.000Z"),
				updatedAt: NOW,
			})
			.where(eq(booking.id, BOOKING_ID));

		const workflow = processCancellationWorkflow(db);
		const result = await workflow.execute(
			{
				requestId: REQUEST_ID,
				organizationId: ORG_ID,
				appliedByUserId: USER_ID,
			},
			makeCtx(),
		);

		expect(result.success).toBe(true);
		expect(provider.refundPayment).toHaveBeenCalledWith(
			expect.objectContaining({ amountCents: 2500 }),
			expect.anything(),
		);

		const [refund] = await db
			.select()
			.from(bookingRefund)
			.where(
				and(
					eq(bookingRefund.bookingId, BOOKING_ID),
					eq(bookingRefund.status, "processed"),
				),
			)
			.limit(1);
		expect(refund?.amountCents).toBe(2500);
	});
});
