import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	affiliateReferral,
	bookingAffiliateAttribution,
	bookingAffiliatePayout,
} from "../schema/affiliate";
import { assistantChat, assistantMessage } from "../schema/assistant";
import { invitation, member, organization, user } from "../schema/auth";
import {
	listingAvailabilityBlock,
	listingAvailabilityRule,
} from "../schema/availability";
import { userConsent } from "../schema/consent";
import {
	booking,
	bookingCancellationRequest,
	cancellationPolicy,
	listing,
	listingPricingProfile,
	listingPublication,
	listingStaffAssignment,
	listingTypeConfig,
	organizationPaymentConfig,
	organizationSettings,
	paymentProviderConfig,
	paymentWebhookEvent,
} from "../schema/marketplace";
import {
	notificationDelivery,
	notificationEvent,
	notificationInApp,
	notificationIntent,
	notificationPreference,
} from "../schema/notification";
import {
	inboundMessage,
	supportTicket,
	supportTicketMessage,
} from "../schema/support";
import { todo } from "../schema/todo";
import {
	bootstrapTestDatabase,
	clearTestDatabase,
	type TestDatabase,
} from "../test";
import {
	MARKETPLACE_IDS,
	seedMarketplaceScenario,
} from "../test/fixtures/marketplace";

describe("Test Database Setup", () => {
	const testDatabase = bootstrapTestDatabase({ seedStrategy: "beforeEach" });
	let db: TestDatabase;

	beforeEach(() => {
		db = testDatabase.db;
	});

	describe("User table", () => {
		it("can create a user", async () => {
			await db.insert(user).values({
				id: "user-1",
				name: "John Doe",
				email: "john@example.com",
				emailVerified: false,
			});

			const users = await db.select().from(user);
			expect(users).toHaveLength(1);
			expect(users[0]?.email).toBe("john@example.com");
		});

		it("enforces unique email constraint", async () => {
			await db.insert(user).values({
				id: "user-1",
				name: "John Doe",
				email: "john@example.com",
				emailVerified: false,
			});

			await expect(
				db.insert(user).values({
					id: "user-2",
					name: "Jane Doe",
					email: "john@example.com",
					emailVerified: true,
				})
			).rejects.toThrow();
		});
	});

	describe("Todo table", () => {
		it("supports create, update, and delete", async () => {
			const [inserted] = await db
				.insert(todo)
				.values({ text: "Ship starter" })
				.returning();
			expect(inserted).toBeDefined();
			if (!inserted) {
				throw new Error("Insert returned no row");
			}

			await db
				.update(todo)
				.set({ completed: true })
				.where(eq(todo.id, inserted.id));

			const [updated] = await db
				.select()
				.from(todo)
				.where(eq(todo.id, inserted.id));
			expect(updated?.completed).toBe(true);

			await db.delete(todo).where(eq(todo.id, inserted.id));
			const rows = await db.select().from(todo);
			expect(rows).toHaveLength(0);
		});
	});

	describe("Organization membership", () => {
		it("enforces one membership per user per organization", async () => {
			await db.insert(organization).values({
				id: "org-1",
				name: "Primary Org",
				slug: "primary-org",
			});
			await db.insert(user).values({
				id: "user-1",
				name: "Org User",
				email: "org-user@example.com",
				emailVerified: true,
			});

			await db.insert(member).values({
				id: "member-1",
				organizationId: "org-1",
				userId: "user-1",
				role: "org_owner",
			});

			await expect(
				db.insert(member).values({
					id: "member-2",
					organizationId: "org-1",
					userId: "user-1",
					role: "manager",
				})
			).rejects.toThrow();
		});

		it("supports invitation rows", async () => {
			await db.insert(organization).values({
				id: "org-inv-1",
				name: "Inv Org",
				slug: "inv-org",
			});
			await db.insert(user).values({
				id: "user-inv-1",
				name: "Inviter",
				email: "inviter@example.com",
				emailVerified: true,
			});

			await db.insert(invitation).values({
				id: "inv-1",
				organizationId: "org-inv-1",
				email: "new-user@example.com",
				role: "member",
				status: "pending",
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
				inviterId: "user-inv-1",
			});

			const invitations = await db.select().from(invitation);
			expect(invitations).toHaveLength(1);
			expect(invitations[0]?.email).toBe("new-user@example.com");
		});
	});

	describe("Assistant tables", () => {
		it("creates chats with messages", async () => {
			await db.insert(user).values({
				id: "user-chat-1",
				name: "Chat User",
				email: "chat@example.com",
				emailVerified: true,
			});

			await db.insert(assistantChat).values({
				id: "chat-1",
				title: "Starter chat",
				userId: "user-chat-1",
				visibility: "private",
			});

			await db.insert(assistantMessage).values({
				id: "msg-1",
				chatId: "chat-1",
				role: "assistant",
				parts: [{ type: "text", text: "Hello" }],
				attachments: [],
			});

			const messages = await db.select().from(assistantMessage);
			expect(messages).toHaveLength(1);
			expect(messages[0]?.chatId).toBe("chat-1");
		});
	});

	describe("Consent table", () => {
		it("records user consent versions", async () => {
			await db.insert(user).values({
				id: "user-consent-1",
				name: "Consent User",
				email: "consent@example.com",
				emailVerified: true,
			});

			await db.insert(userConsent).values({
				id: "consent-1",
				userId: "user-consent-1",
				consentType: "service_agreement",
				consentVersion: "2026-02-14",
				consentedAt: new Date(),
				ipAddress: "127.0.0.1",
				userAgent: "vitest",
			});

			const rows = await db.select().from(userConsent);
			expect(rows).toHaveLength(1);
			expect(rows[0]?.consentType).toBe("service_agreement");
		});
	});

	describe("Notification tables", () => {
		it("enforces event idempotency key uniqueness per organization", async () => {
			await db.insert(organization).values({
				id: "org-notify-1",
				name: "Notify Org",
				slug: "notify-org",
			});

			await db.insert(notificationEvent).values({
				id: "event-1",
				organizationId: "org-notify-1",
				eventType: "task.recurring.tick",
				idempotencyKey: "notify:org-notify-1:1",
				payload: { recipients: [] },
			});

			await expect(
				db.insert(notificationEvent).values({
					id: "event-2",
					organizationId: "org-notify-1",
					eventType: "task.recurring.tick",
					idempotencyKey: "notify:org-notify-1:1",
					payload: { recipients: [] },
				})
			).rejects.toThrow();
		});

		it("supports event -> intent -> delivery -> in-app flow", async () => {
			await db.insert(organization).values({
				id: "org-notify-2",
				name: "Notify Org 2",
				slug: "notify-org-2",
			});
			await db.insert(user).values({
				id: "user-notify-1",
				name: "Notify User",
				email: "notify@example.com",
				emailVerified: true,
			});

			await db.insert(notificationEvent).values({
				id: "event-flow-1",
				organizationId: "org-notify-2",
				eventType: "payment.mock.charge.succeeded",
				idempotencyKey: "notify:org-notify-2:charge:1",
				payload: { recipients: [{ userId: "user-notify-1" }] },
				status: "queued",
			});

			await db.insert(notificationIntent).values({
				id: "intent-1",
				eventId: "event-flow-1",
				organizationId: "org-notify-2",
				recipientUserId: "user-notify-1",
				channel: "in_app",
				templateKey: "payment.mock.charge",
				title: "Charge succeeded",
				body: "Your payment succeeded",
				metadata: { receiptId: "receipt-1" },
				status: "sent",
			});

			await db.insert(notificationDelivery).values({
				id: "delivery-1",
				intentId: "intent-1",
				organizationId: "org-notify-2",
				provider: "in_app",
				providerRecipient: "user-notify-1",
				attempt: 1,
				status: "sent",
				sentAt: new Date(),
			});

			await expect(
				db.insert(notificationDelivery).values({
					id: "delivery-2",
					intentId: "intent-1",
					organizationId: "org-notify-2",
					provider: "in_app",
					attempt: 1,
					status: "queued",
				})
			).rejects.toThrow();

			await db.insert(notificationInApp).values({
				id: "in-app-1",
				eventId: "event-flow-1",
				intentId: "intent-1",
				organizationId: "org-notify-2",
				userId: "user-notify-1",
				title: "Charge succeeded",
				body: "Your payment succeeded",
				ctaUrl: "/dashboard",
				severity: "success",
				metadata: { receiptId: "receipt-1" },
				deliveredAt: new Date(),
			});

			const intents = await db.select().from(notificationIntent);
			const deliveries = await db.select().from(notificationDelivery);
			const inApp = await db.select().from(notificationInApp);
			expect(intents).toHaveLength(1);
			expect(deliveries).toHaveLength(1);
			expect(inApp).toHaveLength(1);
			expect(inApp[0]?.metadata).toEqual({ receiptId: "receipt-1" });
		});

		it("enforces notification preference scope uniqueness", async () => {
			await db.insert(user).values({
				id: "user-pref-1",
				name: "Preference User",
				email: "prefs@example.com",
				emailVerified: true,
			});

			await db.insert(notificationPreference).values({
				id: "pref-1",
				userId: "user-pref-1",
				organizationId: null,
				organizationScopeKey: "global",
				eventType: "*",
				channel: "in_app",
				enabled: true,
			});

			await expect(
				db.insert(notificationPreference).values({
					id: "pref-2",
					userId: "user-pref-1",
					organizationId: null,
					organizationScopeKey: "global",
					eventType: "*",
					channel: "in_app",
					enabled: false,
				})
			).rejects.toThrow();
		});
	});

	describe("Marketplace draft tables", () => {
		it("supports core marketplace inserts", async () => {
			await db.insert(organization).values({
				id: "org-market-1",
				name: "Market Org",
				slug: "market-org",
			});
			await db.insert(user).values({
				id: "user-market-1",
				name: "Market Owner",
				email: "market-owner@example.com",
				emailVerified: true,
			});

			await db.insert(organizationSettings).values({
				id: "org-settings-1",
				organizationId: "org-market-1",
			});

			await db.insert(listingTypeConfig).values({
				id: "listing-type-1",
				slug: "boat",
				label: "Boat",
				metadataJsonSchema: { type: "object" },
			});

			await db.insert(listing).values({
				id: "listing-1",
				organizationId: "org-market-1",
				listingTypeSlug: "boat",
				name: "Catamaran Serenity",
				slug: "catamaran-serenity",
				status: "active",
			});

			await db.insert(listingPricingProfile).values({
				id: "pricing-1",
				listingId: "listing-1",
				name: "Base Price",
				currency: "RUB",
				baseHourlyPriceCents: 5000,
				createdByUserId: "user-market-1",
				isDefault: true,
			});

			await db.insert(paymentProviderConfig).values({
				id: "provider-config-cp",
				provider: "cloudpayments",
				displayName: "CloudPayments",
				supportedCurrencies: ["RUB", "USD", "EUR"],
			});

			await db.insert(organizationPaymentConfig).values({
				id: "payment-config-1",
				organizationId: "org-market-1",
				providerConfigId: "provider-config-cp",
				provider: "cloudpayments",
				encryptedCredentials: "encrypted-json",
				webhookEndpointId: "webhook-endpoint-1",
			});

			await db.insert(listingPublication).values({
				id: "publication-1",
				listingId: "listing-1",
				organizationId: "org-market-1",
				channelType: "platform_marketplace",
				merchantType: "platform",
				merchantPaymentConfigId: "payment-config-1",
				pricingProfileId: "pricing-1",
			});

			await db.insert(booking).values({
				id: "booking-1",
				organizationId: "org-market-1",
				listingId: "listing-1",
				publicationId: "publication-1",
				merchantOrganizationId: "org-market-1",
				merchantPaymentConfigId: "payment-config-1",
				customerUserId: "user-market-1",
				createdByUserId: "user-market-1",
				source: "web",
				startsAt: new Date("2026-03-09T10:00:00.000Z"),
				endsAt: new Date("2026-03-09T12:00:00.000Z"),
				basePriceCents: 10_000,
				totalPriceCents: 10_000,
				currency: "RUB",
			});

			const settings = await db.select().from(organizationSettings);
			const listings = await db.select().from(listing);
			const bookings = await db.select().from(booking);

			expect(settings).toHaveLength(1);
			expect(listings).toHaveLength(1);
			expect(bookings).toHaveLength(1);
			expect(bookings[0]?.publicationId).toBe("publication-1");
		});

		it("enforces payment webhook idempotency on request signature", async () => {
			await db.insert(organization).values({
				id: "org-webhook-1",
				name: "Webhook Org",
				slug: "webhook-org",
			});

			await db.insert(paymentWebhookEvent).values({
				id: "payment-webhook-1",
				organizationId: "org-webhook-1",
				endpointId: "endpoint-1",
				provider: "cloudpayments",
				webhookType: "pay",
				requestSignature: "endpoint-1:pay:tx-1",
				payload: { transactionId: "tx-1" },
			});

			await expect(
				db.insert(paymentWebhookEvent).values({
					id: "payment-webhook-2",
					organizationId: "org-webhook-1",
					endpointId: "endpoint-1",
					provider: "cloudpayments",
					webhookType: "pay",
					requestSignature: "endpoint-1:pay:tx-1",
					payload: { transactionId: "tx-1" },
				})
			).rejects.toThrow();
		});
	});

	describe("Availability tables", () => {
		it("supports availability rules and blocks", async () => {
			await db.insert(organization).values({
				id: "org-avail-1",
				name: "Avail Org",
				slug: "avail-org",
			});
			await db.insert(listingTypeConfig).values({
				id: "lt-avail-1",
				slug: "avail-boat",
				label: "Boat",
				metadataJsonSchema: { type: "object" },
			});
			await db.insert(listing).values({
				id: "listing-avail-1",
				organizationId: "org-avail-1",
				listingTypeSlug: "avail-boat",
				name: "Avail Catamaran",
				slug: "avail-catamaran",
				status: "active",
			});

			await db.insert(listingAvailabilityRule).values({
				id: "rule-1",
				listingId: "listing-avail-1",
				dayOfWeek: 1,
				startMinute: 540,
				endMinute: 1080,
			});

			await db.insert(listingAvailabilityBlock).values({
				id: "block-1",
				listingId: "listing-avail-1",
				source: "maintenance",
				startsAt: new Date("2026-03-15T09:00:00.000Z"),
				endsAt: new Date("2026-03-15T18:00:00.000Z"),
				reason: "Engine maintenance",
			});

			const rules = await db.select().from(listingAvailabilityRule);
			const blocks = await db.select().from(listingAvailabilityBlock);
			expect(rules).toHaveLength(1);
			expect(blocks).toHaveLength(1);
			expect(rules[0]?.dayOfWeek).toBe(1);
		});
	});

	describe("Affiliate tables", () => {
		it("supports referral and attribution chain", async () => {
			await db.insert(organization).values({
				id: "org-aff-1",
				name: "Aff Org",
				slug: "aff-org",
			});
			await db.insert(user).values({
				id: "user-aff-1",
				name: "Affiliate",
				email: "affiliate@example.com",
				emailVerified: true,
			});
			await db.insert(user).values({
				id: "user-cust-aff-1",
				name: "Customer",
				email: "cust-aff@example.com",
				emailVerified: true,
			});

			await db.insert(affiliateReferral).values({
				id: "ref-1",
				affiliateUserId: "user-aff-1",
				code: "AFF2026",
				name: "Summer campaign",
			});

			// Create a booking to attribute
			await db.insert(listingTypeConfig).values({
				id: "lt-aff-1",
				slug: "aff-boat",
				label: "Boat",
				metadataJsonSchema: { type: "object" },
			});
			await db.insert(listing).values({
				id: "listing-aff-1",
				organizationId: "org-aff-1",
				listingTypeSlug: "aff-boat",
				name: "Aff Catamaran",
				slug: "aff-catamaran",
				status: "active",
			});
			await db.insert(paymentProviderConfig).values({
				id: "ppc-aff-1",
				provider: "stripe",
				displayName: "Stripe",
				supportedCurrencies: ["RUB"],
			});
			await db.insert(organizationPaymentConfig).values({
				id: "opc-aff-1",
				organizationId: "org-aff-1",
				providerConfigId: "ppc-aff-1",
				provider: "stripe",
				encryptedCredentials: "enc",
				webhookEndpointId: "wh-aff-1",
			});
			await db.insert(listingPublication).values({
				id: "pub-aff-1",
				listingId: "listing-aff-1",
				organizationId: "org-aff-1",
				channelType: "partner_site",
				merchantType: "platform",
				merchantPaymentConfigId: "opc-aff-1",
			});
			await db.insert(booking).values({
				id: "booking-aff-1",
				organizationId: "org-aff-1",
				listingId: "listing-aff-1",
				publicationId: "pub-aff-1",
				merchantOrganizationId: "org-aff-1",
				customerUserId: "user-cust-aff-1",
				source: "partner",
				startsAt: new Date("2026-04-01T10:00:00.000Z"),
				endsAt: new Date("2026-04-01T12:00:00.000Z"),
				basePriceCents: 8000,
				totalPriceCents: 8000,
				currency: "RUB",
			});

			await db.insert(bookingAffiliateAttribution).values({
				id: "attr-1",
				bookingId: "booking-aff-1",
				affiliateUserId: "user-aff-1",
				referralId: "ref-1",
				referralCode: "AFF2026",
				source: "cookie",
			});

			await db.insert(bookingAffiliatePayout).values({
				id: "payout-1",
				attributionId: "attr-1",
				bookingId: "booking-aff-1",
				affiliateUserId: "user-aff-1",
				commissionAmountCents: 400,
				currency: "RUB",
				status: "pending",
			});

			const refs = await db.select().from(affiliateReferral);
			const payouts = await db.select().from(bookingAffiliatePayout);
			expect(refs).toHaveLength(1);
			expect(payouts).toHaveLength(1);
			expect(payouts[0]?.commissionAmountCents).toBe(400);
		});
	});

	describe("Support ticket tables", () => {
		it("supports ticket -> message -> inbound flow", async () => {
			await db.insert(organization).values({
				id: "org-sup-1",
				name: "Support Org",
				slug: "support-org",
			});
			await db.insert(user).values({
				id: "user-sup-1",
				name: "Support Operator",
				email: "support-op@example.com",
				emailVerified: true,
			});

			await db.insert(supportTicket).values({
				id: "ticket-1",
				organizationId: "org-sup-1",
				customerUserId: "user-sup-1",
				closedByUserId: "user-sup-1",
				subject: "Cannot access booking",
				source: "web",
				priority: "high",
				status: "closed",
				closedAt: new Date("2026-03-11T12:00:00.000Z"),
			});

			await db.insert(inboundMessage).values({
				id: "inbound-1",
				organizationId: "org-sup-1",
				ticketId: "ticket-1",
				channel: "web",
				externalMessageId: "ext-msg-1",
				dedupeKey: "web:ext-msg-1",
				payload: { text: "Help, I cannot see my booking" },
				status: "processed",
			});

			await db.insert(supportTicketMessage).values({
				id: "msg-sup-1",
				ticketId: "ticket-1",
				organizationId: "org-sup-1",
				authorUserId: "user-sup-1",
				inboundMessageId: "inbound-1",
				channel: "web",
				body: "Help, I cannot see my booking",
			});

			// Internal note
			await db.insert(supportTicketMessage).values({
				id: "msg-sup-2",
				ticketId: "ticket-1",
				organizationId: "org-sup-1",
				authorUserId: "user-sup-1",
				channel: "internal",
				body: "Checking booking status...",
				isInternal: true,
			});

			const tickets = await db.select().from(supportTicket);
			const messages = await db.select().from(supportTicketMessage);
			const inbound = await db.select().from(inboundMessage);
			expect(tickets).toHaveLength(1);
			expect(messages).toHaveLength(2);
			expect(inbound).toHaveLength(1);
			expect(tickets[0]?.priority).toBe("high");
			expect(tickets[0]?.closedByUserId).toBe("user-sup-1");
		});

		it("enforces inbound message deduplication", async () => {
			await db.insert(inboundMessage).values({
				id: "inbound-dup-1",
				channel: "telegram",
				externalMessageId: "tg-123",
				dedupeKey: "tg:chat:123",
				payload: { text: "Hello" },
			});

			await expect(
				db.insert(inboundMessage).values({
					id: "inbound-dup-2",
					channel: "telegram",
					externalMessageId: "tg-456",
					dedupeKey: "tg:chat:123",
					payload: { text: "Hello again" },
				})
			).rejects.toThrow();
		});
	});

	describe("Staff assignment tables", () => {
		it("supports listing and booking staff assignment", async () => {
			await db.insert(organization).values({
				id: "org-staff-1",
				name: "Staff Org",
				slug: "staff-org",
			});
			await db.insert(user).values({
				id: "user-staff-1",
				name: "Captain",
				email: "captain@example.com",
				emailVerified: true,
			});
			await db.insert(member).values({
				id: "member-staff-1",
				organizationId: "org-staff-1",
				userId: "user-staff-1",
				role: "member",
			});
			await db.insert(listingTypeConfig).values({
				id: "lt-staff-1",
				slug: "staff-boat",
				label: "Boat",
				metadataJsonSchema: { type: "object" },
			});
			await db.insert(listing).values({
				id: "listing-staff-1",
				organizationId: "org-staff-1",
				listingTypeSlug: "staff-boat",
				name: "Staff Catamaran",
				slug: "staff-catamaran",
				status: "active",
			});

			await db.insert(listingStaffAssignment).values({
				id: "lsa-1",
				listingId: "listing-staff-1",
				memberId: "member-staff-1",
				organizationId: "org-staff-1",
				role: "primary",
			});

			const assignments = await db.select().from(listingStaffAssignment);
			expect(assignments).toHaveLength(1);
			expect(assignments[0]?.role).toBe("primary");
		});
	});

	describe("Cancellation policy table", () => {
		it("supports org-level and listing-level policies", async () => {
			await db.insert(organization).values({
				id: "org-cancel-1",
				name: "Cancel Org",
				slug: "cancel-org",
			});

			await db.insert(cancellationPolicy).values({
				id: "cp-org-1",
				organizationId: "org-cancel-1",
				scope: "organization",
				name: "Default policy",
				freeWindowHours: 48,
				penaltyBps: 5000,
			});

			const policies = await db.select().from(cancellationPolicy);
			expect(policies).toHaveLength(1);
			expect(policies[0]?.freeWindowHours).toBe(48);
		});
	});

	describe("Cancellation request tables", () => {
		it("supports dual-approval cancellation flow", async () => {
			await db.insert(organization).values({
				id: "org-cancelreq-1",
				name: "CancelReq Org",
				slug: "cancelreq-org",
			});
			await db.insert(user).values([
				{
					id: "user-cancelreq-customer",
					name: "Customer",
					email: "cancelreq-customer@example.com",
					emailVerified: true,
				},
				{
					id: "user-cancelreq-manager",
					name: "Manager",
					email: "cancelreq-manager@example.com",
					emailVerified: true,
				},
			]);
			await db.insert(listingTypeConfig).values({
				id: "lt-cancelreq-1",
				slug: "cancelreq-boat",
				label: "Boat",
				metadataJsonSchema: { type: "object" },
			});
			await db.insert(listing).values({
				id: "listing-cancelreq-1",
				organizationId: "org-cancelreq-1",
				listingTypeSlug: "cancelreq-boat",
				name: "Cancel Test Boat",
				slug: "cancel-test-boat",
			});
			await db.insert(paymentProviderConfig).values({
				id: "ppc-cancelreq-1",
				provider: "cloudpayments",
				displayName: "CP",
				supportedCurrencies: ["RUB"],
			});
			await db.insert(organizationPaymentConfig).values({
				id: "opc-cancelreq-1",
				organizationId: "org-cancelreq-1",
				providerConfigId: "ppc-cancelreq-1",
				provider: "cloudpayments",
				encryptedCredentials: "enc_test",
				webhookEndpointId: "wh-cancelreq-1",
			});
			await db.insert(listingPublication).values({
				id: "pub-cancelreq-1",
				listingId: "listing-cancelreq-1",
				organizationId: "org-cancelreq-1",
				channelType: "own_site",
			});
			await db.insert(booking).values({
				id: "booking-cancelreq-1",
				organizationId: "org-cancelreq-1",
				listingId: "listing-cancelreq-1",
				publicationId: "pub-cancelreq-1",
				merchantOrganizationId: "org-cancelreq-1",
				customerUserId: "user-cancelreq-customer",
				source: "web",
				status: "confirmed",
				startsAt: new Date("2026-03-15T10:00:00Z"),
				endsAt: new Date("2026-03-15T14:00:00Z"),
				basePriceCents: 50_000,
				totalPriceCents: 50_000,
				currency: "RUB",
			});

			// Customer initiates cancellation request
			await db.insert(bookingCancellationRequest).values({
				id: "cr-1",
				bookingId: "booking-cancelreq-1",
				organizationId: "org-cancelreq-1",
				requestedByUserId: "user-cancelreq-customer",
				initiatedByRole: "customer",
				status: "requested",
				reason: "Weather forecast is bad",
				bookingTotalPriceCents: 50_000,
				penaltyAmountCents: 0,
				refundAmountCents: 50_000,
				currency: "RUB",
			});

			const requests = await db.select().from(bookingCancellationRequest);
			expect(requests).toHaveLength(1);
			expect(requests[0]?.status).toBe("requested");
			expect(requests[0]?.customerDecision).toBe("pending");
			expect(requests[0]?.managerDecision).toBe("pending");

			// Manager approves
			await db
				.update(bookingCancellationRequest)
				.set({
					managerDecision: "approved",
					managerDecisionByUserId: "user-cancelreq-manager",
					managerDecisionAt: new Date(),
					status: "approved",
				})
				.where(eq(bookingCancellationRequest.id, "cr-1"));

			const updated = await db
				.select()
				.from(bookingCancellationRequest)
				.where(eq(bookingCancellationRequest.id, "cr-1"));
			expect(updated[0]?.status).toBe("approved");
			expect(updated[0]?.managerDecision).toBe("approved");
		});

		it("enforces one cancellation request per booking", async () => {
			await db.insert(organization).values({
				id: "org-cancelreq-dup",
				name: "Dup Org",
				slug: "dup-org",
			});
			await db.insert(user).values({
				id: "user-cancelreq-dup",
				name: "Dup User",
				email: "cancelreq-dup@example.com",
				emailVerified: true,
			});
			await db.insert(listingTypeConfig).values({
				id: "lt-cancelreq-dup",
				slug: "cancelreq-dup-boat",
				label: "Boat",
				metadataJsonSchema: { type: "object" },
			});
			await db.insert(listing).values({
				id: "listing-cancelreq-dup",
				organizationId: "org-cancelreq-dup",
				listingTypeSlug: "cancelreq-dup-boat",
				name: "Dup Boat",
				slug: "dup-boat",
			});
			await db.insert(paymentProviderConfig).values({
				id: "ppc-cancelreq-dup",
				provider: "stripe",
				displayName: "Stripe",
				supportedCurrencies: ["RUB"],
			});
			await db.insert(organizationPaymentConfig).values({
				id: "opc-cancelreq-dup",
				organizationId: "org-cancelreq-dup",
				providerConfigId: "ppc-cancelreq-dup",
				provider: "stripe",
				encryptedCredentials: "enc_dup",
				webhookEndpointId: "wh-cancelreq-dup",
			});
			await db.insert(listingPublication).values({
				id: "pub-cancelreq-dup",
				listingId: "listing-cancelreq-dup",
				organizationId: "org-cancelreq-dup",
				channelType: "own_site",
			});
			await db.insert(booking).values({
				id: "booking-cancelreq-dup",
				organizationId: "org-cancelreq-dup",
				listingId: "listing-cancelreq-dup",
				publicationId: "pub-cancelreq-dup",
				merchantOrganizationId: "org-cancelreq-dup",
				source: "web",
				status: "confirmed",
				startsAt: new Date("2026-03-15T10:00:00Z"),
				endsAt: new Date("2026-03-15T14:00:00Z"),
				basePriceCents: 30_000,
				totalPriceCents: 30_000,
				currency: "RUB",
			});

			await db.insert(bookingCancellationRequest).values({
				id: "cr-dup-1",
				bookingId: "booking-cancelreq-dup",
				organizationId: "org-cancelreq-dup",
				requestedByUserId: "user-cancelreq-dup",
				initiatedByRole: "customer",
				bookingTotalPriceCents: 30_000,
				penaltyAmountCents: 0,
				refundAmountCents: 30_000,
				currency: "RUB",
			});

			await expect(
				db.insert(bookingCancellationRequest).values({
					id: "cr-dup-2",
					bookingId: "booking-cancelreq-dup",
					organizationId: "org-cancelreq-dup",
					requestedByUserId: "user-cancelreq-dup",
					initiatedByRole: "manager",
					bookingTotalPriceCents: 30_000,
					penaltyAmountCents: 0,
					refundAmountCents: 30_000,
					currency: "RUB",
				})
			).rejects.toThrow();
		});
	});

	describe("clearTestDatabase", () => {
		it("clears all data", async () => {
			await db.insert(user).values({
				id: "user-clear-1",
				name: "Clear User",
				email: "clear@example.com",
				emailVerified: false,
			});
			await db.insert(todo).values({ text: "to clear" });

			await clearTestDatabase(db);

			const users = await db.select().from(user);
			const todos = await db.select().from(todo);
			expect(users).toHaveLength(0);
			expect(todos).toHaveLength(0);
		});
	});

	describe("Marketplace scenario fixture", () => {
		const fixtureDb = bootstrapTestDatabase({
			seed: async (db) => {
				await seedMarketplaceScenario(db, {
					anchorDate: new Date("2026-03-15T00:00:00.000Z"),
				});
			},
			seedStrategy: "beforeAll",
		});
		let fdb: TestDatabase;
		beforeEach(() => {
			fdb = fixtureDb.db;
		});

		it("seeds operator org and listing", async () => {
			const orgs = await fdb
				.select()
				.from(organization)
				.where(eq(organization.id, MARKETPLACE_IDS.operatorOrgId));
			expect(orgs).toHaveLength(1);
			expect(orgs[0]?.slug).toBe("starter-org");

			const listings = await fdb
				.select()
				.from(listing)
				.where(eq(listing.id, MARKETPLACE_IDS.listingId));
			expect(listings).toHaveLength(1);
			expect(listings[0]?.status).toBe("active");
		});

		it("seeds confirmed paid booking with correct amounts", async () => {
			const bookings = await fdb
				.select()
				.from(booking)
				.where(eq(booking.id, MARKETPLACE_IDS.bookingId));
			expect(bookings).toHaveLength(1);
			const [b] = bookings;
			expect(b).toBeDefined();
			if (!b) {
				throw new Error("Expected seeded booking to exist");
			}
			expect(b.status).toBe("confirmed");
			expect(b.paymentStatus).toBe("paid");
			expect(b.totalPriceCents).toBe(1_200_000);
			expect(b.currency).toBe("RUB");
		});

		it("seeds active listing publication on own_site channel", async () => {
			const pubs = await fdb
				.select()
				.from(listingPublication)
				.where(eq(listingPublication.id, MARKETPLACE_IDS.publicationId));
			expect(pubs).toHaveLength(1);
			expect(pubs[0]?.channelType).toBe("own_site");
			expect(pubs[0]?.isActive).toBe(true);
		});

		it("seeds cancellation policy with correct window", async () => {
			const policies = await fdb
				.select()
				.from(cancellationPolicy)
				.where(eq(cancellationPolicy.id, MARKETPLACE_IDS.cancellationPolicyId));
			expect(policies).toHaveLength(1);
			expect(policies[0]?.freeWindowHours).toBe(48);
			expect(policies[0]?.penaltyBps).toBe(5000);
		});
	});
});
