import { organization, user } from "@my-app/db/schema/auth";
import {
	booking,
	listing,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { EventBus } from "@my-app/events";
import type { WorkflowContext } from "@my-app/workflows";
import type { Db, SupportActorContext } from "../shared/types";

export const ORG_ID = "sup-org-1";
export const OTHER_ORG_ID = "sup-org-2";
export const BOOKING_ID = "sup-booking-1";
export const LISTING_TYPE_SLUG = "sup-test-type";
export const OPERATOR_USER_ID = "sup-operator-1";
export const AGENT_USER_ID = "sup-agent-1";
export const CUSTOMER_USER_ID = "sup-customer-1";
export const OTHER_CUSTOMER_USER_ID = "sup-customer-2";

const now = new Date("2026-03-11T00:00:00.000Z");
const later = new Date(now.getTime() + 3_600_000);

const testDbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: LISTING_TYPE_SLUG,
			label: "Support Test Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});
		await db.insert(organization).values([
			{ id: ORG_ID, name: "Support Org One", slug: "sup-org-one" },
			{ id: OTHER_ORG_ID, name: "Support Org Two", slug: "sup-org-two" },
		]);
		await db.insert(user).values([
			{
				id: OPERATOR_USER_ID,
				name: "Support Operator",
				email: "support-op@test.com",
				emailVerified: true,
			},
			{
				id: AGENT_USER_ID,
				name: "Assigned Agent",
				email: "assigned-agent@test.com",
				emailVerified: true,
			},
			{
				id: CUSTOMER_USER_ID,
				name: "Customer One",
				email: "customer-1@test.com",
				emailVerified: true,
			},
			{
				id: OTHER_CUSTOMER_USER_ID,
				name: "Customer Two",
				email: "customer-2@test.com",
				emailVerified: true,
			},
		]);
		await db.insert(listing).values({
			id: "sup-listing-1",
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "Support Listing",
			slug: "sup-listing",
		});
		await db.insert(listingPublication).values({
			id: "sup-pub-1",
			listingId: "sup-listing-1",
			organizationId: ORG_ID,
			channelType: "own_site",
		});
		await db.insert(booking).values({
			id: BOOKING_ID,
			organizationId: ORG_ID,
			listingId: "sup-listing-1",
			publicationId: "sup-pub-1",
			merchantOrganizationId: ORG_ID,
			source: "web",
			status: "confirmed",
			startsAt: now,
			endsAt: later,
			basePriceCents: 10_000,
			totalPriceCents: 10_000,
			currency: "RUB",
			customerUserId: CUSTOMER_USER_ID,
		});
	},
});

export const getDb = () => testDbState.db as unknown as Db;

export const makeActorContext = (
	overrides: Partial<SupportActorContext> = {},
): SupportActorContext => ({
	actorUserId: OPERATOR_USER_ID,
	eventBus: new EventBus(),
	...overrides,
});

export const makeWorkflowContext = (
	overrides: Partial<WorkflowContext> = {},
): WorkflowContext => ({
	organizationId: ORG_ID,
	actorUserId: OPERATOR_USER_ID,
	idempotencyKey: "support-workflow-1",
	eventBus: new EventBus(),
	...overrides,
});
