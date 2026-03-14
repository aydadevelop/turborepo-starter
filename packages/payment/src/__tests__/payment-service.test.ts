import { organization } from "@my-app/db/schema/auth";
import {
	booking,
	bookingPaymentAttempt,
	listing,
	listingPublication,
	listingTypeConfig,
	organizationPaymentConfig,
	paymentProviderConfig,
	paymentWebhookEvent,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
	connectPaymentProvider,
	reconcilePaymentWebhook,
} from "../payment-service";
import type { Db } from "../types";

const ORG_ID = "pm-org-1";
const PROVIDER_CONFIG_ID = "pm-provider-cfg-1";
const WEBHOOK_ENDPOINT_ID = "pm-webhook-endpoint-1";
const BOOKING_ID = "pm-booking-1";
const PUB_ID = "pm-pub-1";
const LISTING_ID = "pm-listing-1";
const LISTING_TYPE_SLUG = "pm-test-type";

const now = new Date();
const future = new Date(now.getTime() + 30 * 24 * 3_600_000); // 30 days

const testDbState = bootstrapTestDatabase({
	seedStrategy: "beforeAll",
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: LISTING_TYPE_SLUG,
			label: "PM Test Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});
		await db
			.insert(organization)
			.values({ id: ORG_ID, name: "PM Org", slug: "pm-org" });
		await db.insert(paymentProviderConfig).values({
			id: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			displayName: "CloudPayments Test",
			supportedCurrencies: ["RUB"],
		});
		await db.insert(organizationPaymentConfig).values({
			id: "pm-org-pay-cfg-1",
			organizationId: ORG_ID,
			providerConfigId: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			encryptedCredentials: "test-encrypted-creds",
			webhookEndpointId: WEBHOOK_ENDPOINT_ID,
		});
		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "PM Listing",
			slug: "pm-listing",
		});
		await db.insert(listingPublication).values({
			id: PUB_ID,
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			channelType: "own_site",
		});
		await db.insert(booking).values({
			id: BOOKING_ID,
			organizationId: ORG_ID,
			listingId: LISTING_ID,
			publicationId: PUB_ID,
			merchantOrganizationId: ORG_ID,
			source: "web",
			status: "confirmed",
			startsAt: future,
			endsAt: new Date(future.getTime() + 3_600_000),
			basePriceCents: 10_000,
			totalPriceCents: 10_000,
			currency: "RUB",
		});
	},
});

const getDb = () => testDbState.db as unknown as Db;

const VALID_PAY_PAYLOAD = {
	TransactionId: "txn-001",
	InvoiceId: BOOKING_ID,
	Amount: "100.00",
	Currency: "RUB",
};

describe("reconcilePaymentWebhook", () => {
	it("processes a pay webhook and returns idempotent=true on a duplicate call", async () => {
		// First call — should process
		const result1 = await reconcilePaymentWebhook(
			WEBHOOK_ENDPOINT_ID,
			"pay",
			VALID_PAY_PAYLOAD,
			getDb(),
		);

		expect(result1.processed).toBe(true);
		expect(result1.idempotent).toBe(false);
		expect(result1.bookingId).toBe(BOOKING_ID);

		// Verify webhook event was inserted and marked processed
		const [processedEvent] = await getDb()
			.select()
			.from(paymentWebhookEvent)
			.where(
				and(
					eq(paymentWebhookEvent.endpointId, WEBHOOK_ENDPOINT_ID),
					eq(paymentWebhookEvent.status, "processed"),
					eq(paymentWebhookEvent.webhookType, "pay"),
				),
			)
			.limit(1);
		expect(processedEvent).toBeDefined();

		// Verify booking paymentStatus updated
		const [updatedBooking] = await getDb()
			.select()
			.from(booking)
			.where(eq(booking.id, BOOKING_ID))
			.limit(1);
		expect(updatedBooking?.paymentStatus).toBe("paid");

		const [updatedConfig] = await getDb()
			.select()
			.from(organizationPaymentConfig)
			.where(
				eq(organizationPaymentConfig.webhookEndpointId, WEBHOOK_ENDPOINT_ID),
			)
			.limit(1);
		expect(updatedConfig?.validationStatus).toBe("validated");
		expect(updatedConfig?.isActive).toBe(true);
		expect(updatedConfig?.validatedAt).toBeInstanceOf(Date);

		const validatedAtAfterFirstIngress =
			updatedConfig?.validatedAt?.toISOString();

		// Second call (duplicate) — should be idempotent
		const result2 = await reconcilePaymentWebhook(
			WEBHOOK_ENDPOINT_ID,
			"pay",
			VALID_PAY_PAYLOAD,
			getDb(),
		);

		expect(result2.idempotent).toBe(true);
		expect(result2.processed).toBe(false);

		const matchingEvents = await getDb()
			.select()
			.from(paymentWebhookEvent)
			.where(
				eq(
					paymentWebhookEvent.requestSignature,
					`${WEBHOOK_ENDPOINT_ID}:pay:${VALID_PAY_PAYLOAD.TransactionId}`,
				),
			);
		expect(matchingEvents).toHaveLength(1);

		const matchingAttempts = await getDb()
			.select()
			.from(bookingPaymentAttempt)
			.where(
				eq(
					bookingPaymentAttempt.providerIntentId,
					String(VALID_PAY_PAYLOAD.TransactionId),
				),
			);
		expect(matchingAttempts).toHaveLength(1);

		const [configAfterDuplicate] = await getDb()
			.select()
			.from(organizationPaymentConfig)
			.where(
				eq(organizationPaymentConfig.webhookEndpointId, WEBHOOK_ENDPOINT_ID),
			)
			.limit(1);
		expect(configAfterDuplicate?.validatedAt?.toISOString()).toBe(
			validatedAtAfterFirstIngress,
		);
	});

	it("throws ENDPOINT_NOT_FOUND for unknown endpointId", async () => {
		await expect(() =>
			reconcilePaymentWebhook(
				"unknown-endpoint-xyz",
				"pay",
				VALID_PAY_PAYLOAD,
				getDb(),
			),
		).rejects.toThrow("ENDPOINT_NOT_FOUND");
	});
});

describe("connectPaymentProvider", () => {
	it("upserts on same org+provider — no duplicate rows after two calls", async () => {
		const input = {
			organizationId: ORG_ID,
			providerConfigId: PROVIDER_CONFIG_ID,
			provider: "cloudpayments" as const,
			publicKey: "pk_test_1",
			encryptedCredentials: "creds-v1",
		};

		await connectPaymentProvider(input, getDb());
		await connectPaymentProvider({ ...input, publicKey: "pk_test_2" }, getDb());

		const rows = await getDb()
			.select()
			.from(organizationPaymentConfig)
			.where(eq(organizationPaymentConfig.organizationId, ORG_ID));

		// Only 1 row should exist for this org (upsert, not insert)
		expect(rows).toHaveLength(1);
		expect(rows[0]?.publicKey).toBe("pk_test_2");
	});
});
