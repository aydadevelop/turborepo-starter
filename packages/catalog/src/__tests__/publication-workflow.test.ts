import { organization } from "@my-app/db/schema/auth";
import {
	listing,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { EventBus } from "@my-app/events";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { createListing } from "../listing-service";
import {
	publishListingWorkflow,
	unpublishListingWorkflow,
} from "../workflows/publication-workflow";

const ORG_ID = "catalog-workflow-org";
const LISTING_TYPE_SLUG = "catalog-workflow-type";
const NOW = new Date("2026-03-12T00:00:00.000Z");

const testDbState = bootstrapTestDatabase({
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Workflow Org",
			slug: "workflow-org",
			createdAt: NOW,
		});

		await db.insert(listingTypeConfig).values({
			id: LISTING_TYPE_SLUG,
			slug: LISTING_TYPE_SLUG,
			label: "Workflow Listing Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
			createdAt: NOW,
			updatedAt: NOW,
		});
	},
	seedStrategy: "beforeEach",
});

const makeListing = async (slug: string, db: TestDatabase) =>
	createListing(
		{
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: `Listing ${slug}`,
			slug,
		},
		db as never
	);

describe("publication workflows", () => {
	it("publishes a listing through the workflow and emits the readiness event", async () => {
		const db = testDbState.db;
		const created = await makeListing("publish-workflow", db);
		const eventBus = new EventBus();
		const emitSpy = vi.spyOn(eventBus, "emit");

		const result = await publishListingWorkflow(db as never).execute(
			{
				listingId: created.id,
				organizationId: ORG_ID,
			},
			{
				organizationId: ORG_ID,
				idempotencyKey: "catalog.publish.success",
				eventBus,
			}
		);

		expect(result.success).toBe(true);
		if (!result.success) {
			return;
		}

		expect(result.output.listing.status).toBe("active");
		expect(result.output.publication.isActive).toBe(true);
		expect(emitSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "listing:organization-publication-readiness-changed",
				organizationId: ORG_ID,
				data: expect.objectContaining({
					isReady: true,
					listingId: created.id,
				}),
			})
		);
	});

	it("compensates listing publication state when event emission fails", async () => {
		const db = testDbState.db;
		const created = await makeListing("publish-compensate", db);
		const failingEventBus = {
			emit: vi.fn().mockRejectedValue(new Error("event bus failure")),
		} as unknown as EventBus;

		const result = await publishListingWorkflow(db as never).execute(
			{
				listingId: created.id,
				organizationId: ORG_ID,
			},
			{
				organizationId: ORG_ID,
				idempotencyKey: "catalog.publish.compensate",
				eventBus: failingEventBus,
			}
		);

		expect(result.success).toBe(false);

		const [listingRow] = await db
			.select()
			.from(listing)
			.where(eq(listing.id, created.id))
			.limit(1);
		expect(listingRow?.status).toBe("inactive");
		expect(listingRow?.isActive).toBe(false);

		const publications = await db
			.select()
			.from(listingPublication)
			.where(
				and(
					eq(listingPublication.listingId, created.id),
					eq(listingPublication.isActive, true)
				)
			);
		expect(publications).toHaveLength(0);
	});

	it("unpublishes a listing through the workflow", async () => {
		const db = testDbState.db;
		const created = await makeListing("unpublish-workflow", db);
		await publishListingWorkflow(db as never).execute(
			{
				listingId: created.id,
				organizationId: ORG_ID,
			},
			{
				organizationId: ORG_ID,
				idempotencyKey: "catalog.publish.prereq",
				eventBus: new EventBus(),
			}
		);

		const result = await unpublishListingWorkflow(db as never).execute(
			{
				listingId: created.id,
				organizationId: ORG_ID,
			},
			{
				organizationId: ORG_ID,
				idempotencyKey: "catalog.unpublish.success",
				eventBus: new EventBus(),
			}
		);

		expect(result.success).toBe(true);
		if (!result.success) {
			return;
		}

		expect(result.output.listing.status).toBe("inactive");
		expect(result.output.listing.isActive).toBe(false);
	});
});
