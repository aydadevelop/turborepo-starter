import { organization, user } from "@my-app/db/schema/auth";
import {
	listing,
	listingPublication,
	listingTypeConfig,
	organizationOnboarding,
	organizationPaymentConfig,
	paymentProviderConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { clearEventPushers, EventBus, emitDomainEvent } from "@my-app/events";
import type { WorkflowContext } from "@my-app/workflows";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	approveOrganizationListing,
	clearOrganizationListingApproval,
	getOrganizationListingModerationAudit,
	getOrganizationOnboardingStatus,
	getOrganizationOverlaySummary,
	publishOrganizationListingToChannel,
	registerOrganizationOverlayProjector,
	unpublishOrganizationListing,
} from "../index";

const ORG_ID = "organization-overlay-org";
const PROVIDER_CONFIG_ID = "organization-overlay-provider";
const MODERATOR_USER_ID = "organization-overlay-moderator";
const WORKFLOW_CONTEXT: WorkflowContext = {
	organizationId: ORG_ID,
	idempotencyKey: "organization-overlay-workflow",
	eventBus: new EventBus(),
};

const testDbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Overlay Org",
			slug: "overlay-org",
		});

		await db.insert(user).values({
			id: MODERATOR_USER_ID,
			name: "Overlay Moderator",
			email: "overlay-moderator@example.com",
			emailVerified: true,
		});

		await db.insert(paymentProviderConfig).values({
			id: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			displayName: "CloudPayments",
			supportedCurrencies: ["RUB"],
		});

		await db.insert(listingTypeConfig).values([
			{
				id: "overlay-type-draft",
				slug: "overlay-type-draft",
				label: "Draft Type",
				metadataJsonSchema: {},
			},
			{
				id: "overlay-type-published",
				slug: "overlay-type-published",
				label: "Published Type",
				metadataJsonSchema: {},
			},
			{
				id: "overlay-type-inactive",
				slug: "overlay-type-inactive",
				label: "Inactive Type",
				metadataJsonSchema: {},
			},
		]);
	},
});

describe("organization onboarding overlay", () => {
	const getOrganizationDb = () =>
		testDbState.db as unknown as NonNullable<
			Parameters<typeof getOrganizationOnboardingStatus>[1]
		>;

	beforeEach(() => {
		clearEventPushers();
	});

	it("creates a persisted onboarding row on first read", async () => {
		const db = getOrganizationDb();
		const status = await getOrganizationOnboardingStatus(ORG_ID, db);

		expect(status).toMatchObject({
			organizationId: ORG_ID,
			paymentConfigured: false,
			calendarConnected: false,
			listingPublished: false,
			isComplete: false,
		});

		const [persisted] = await db
			.select()
			.from(organizationOnboarding)
			.where(eq(organizationOnboarding.organizationId, ORG_ID))
			.limit(1);

		expect(persisted?.organizationId).toBe(ORG_ID);
	});

	it("recalculates onboarding from readiness events through the projector", async () => {
		const db = getOrganizationDb();

		await db.insert(organizationPaymentConfig).values({
			id: "organization-overlay-config",
			organizationId: ORG_ID,
			providerConfigId: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			encryptedCredentials: "encrypted",
			webhookEndpointId: "organization-overlay-endpoint",
			validationStatus: "validated",
			isActive: true,
			validatedAt: new Date("2026-03-12T08:00:00.000Z"),
		});

		registerOrganizationOverlayProjector(db);

		await emitDomainEvent({
			type: "payment:organization-config-readiness-changed",
			organizationId: ORG_ID,
			idempotencyKey: "organization-overlay-projection:payment-ready",
			data: {
				configId: "organization-overlay-config",
				isReady: true,
			},
		});

		const status = await getOrganizationOnboardingStatus(ORG_ID, db);
		expect(status.paymentConfigured).toBe(true);
		expect(status.calendarConnected).toBe(false);
		expect(status.listingPublished).toBe(false);
	});

	it("returns publishing summary counts through the overlay service", async () => {
		const db = getOrganizationDb();

		await db.insert(listing).values([
			{
				id: "overlay-listing-draft",
				organizationId: ORG_ID,
				listingTypeSlug: "overlay-type-draft",
				name: "Draft listing",
				slug: "draft-listing",
				status: "draft",
				isActive: true,
				timezone: "UTC",
			},
			{
				id: "overlay-listing-published",
				organizationId: ORG_ID,
				listingTypeSlug: "overlay-type-published",
				name: "Published listing",
				slug: "published-listing",
				status: "active",
				isActive: true,
				timezone: "UTC",
			},
			{
				id: "overlay-listing-inactive",
				organizationId: ORG_ID,
				listingTypeSlug: "overlay-type-inactive",
				name: "Inactive listing",
				slug: "inactive-listing",
				status: "inactive",
				isActive: false,
				timezone: "UTC",
			},
		]);

		await db.insert(listingPublication).values({
			id: "overlay-publication-1",
			listingId: "overlay-listing-published",
			organizationId: ORG_ID,
			channelType: "platform_marketplace",
			visibility: "public",
			merchantType: "platform",
			isActive: true,
		});

		const summary = await getOrganizationOverlaySummary(ORG_ID, db);

		expect(summary.publishing).toEqual({
			totalListingCount: 3,
			draftListingCount: 1,
			publishedListingCount: 1,
			unpublishedListingCount: 1,
			activePublicationCount: 1,
			reviewPendingCount: 1,
		});
		expect(summary.distribution).toEqual({
			ownSitePublicationCount: 0,
			marketplacePublicationCount: 1,
			listingsWithoutPublicationCount: 2,
		});
		expect(summary.moderation).toEqual({
			approvedListingCount: 0,
			reviewPendingCount: 1,
			unapprovedActiveListingCount: 1,
		});
		expect(summary.blockers).toEqual({
			missingCalendarCount: 3,
			missingLocationCount: 3,
			missingPricingCount: 3,
			missingPrimaryImageCount: 3,
			totalBlockingIssues: 12,
		});
		expect(summary.manualOverrides).toEqual({
			activeCount: 0,
			items: [],
		});
	});

	it("updates moderation state through overlay-owned approval actions", async () => {
		const db = getOrganizationDb();

		await db.insert(listing).values({
			id: "overlay-listing-moderation",
			organizationId: ORG_ID,
			listingTypeSlug: "overlay-type-draft",
			name: "Moderation listing",
			slug: "moderation-listing",
			status: "active",
			isActive: true,
			timezone: "UTC",
		});

		const approved = await approveOrganizationListing(
			{
				listingId: "overlay-listing-moderation",
				organizationId: ORG_ID,
				actorUserId: MODERATOR_USER_ID,
				note: "Approved after marina details review",
			},
			db,
		);
		expect(approved.isApproved).toBe(true);
		expect(approved.approvedAt).not.toBeNull();

		const cleared = await clearOrganizationListingApproval(
			{
				listingId: "overlay-listing-moderation",
				organizationId: ORG_ID,
				actorUserId: MODERATOR_USER_ID,
				note: "Approval cleared after content change",
			},
			db,
		);
		expect(cleared).toEqual({
			listingId: "overlay-listing-moderation",
			approvedAt: null,
			isApproved: false,
		});

		const audit = await getOrganizationListingModerationAudit(
			"overlay-listing-moderation",
			ORG_ID,
			db,
		);
		expect(audit).toMatchObject([
			{
				listingId: "overlay-listing-moderation",
				action: "approval_cleared",
				actedByUserId: MODERATOR_USER_ID,
				actedByDisplayName: "Overlay Moderator",
				note: "Approval cleared after content change",
			},
			{
				listingId: "overlay-listing-moderation",
				action: "approved",
				actedByUserId: MODERATOR_USER_ID,
				actedByDisplayName: "Overlay Moderator",
				note: "Approved after marina details review",
			},
		]);
	});

	it("updates distribution state through overlay-owned publish actions", async () => {
		const db = getOrganizationDb();

		await db.insert(listing).values({
			id: "overlay-listing-distribution",
			organizationId: ORG_ID,
			listingTypeSlug: "overlay-type-draft",
			name: "Distribution listing",
			slug: "distribution-listing",
			status: "draft",
			isActive: true,
			timezone: "UTC",
		});

		const published = await publishOrganizationListingToChannel(
			{
				listingId: "overlay-listing-distribution",
				organizationId: ORG_ID,
				channelType: "own_site",
			},
			WORKFLOW_CONTEXT,
			db,
		);

		expect(published).toEqual({
			listingId: "overlay-listing-distribution",
			activeChannels: ["own_site"],
			activePublicationCount: 1,
			isPublished: true,
		});

		const unpublished = await unpublishOrganizationListing(
			"overlay-listing-distribution",
			ORG_ID,
			WORKFLOW_CONTEXT,
			db,
		);

		expect(unpublished).toEqual({
			listingId: "overlay-listing-distribution",
			activeChannels: [],
			activePublicationCount: 0,
			isPublished: false,
		});
	});
});
