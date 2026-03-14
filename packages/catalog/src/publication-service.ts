import { listing, listingPublication } from "@my-app/db/schema/marketplace";
import type { EventBus } from "@my-app/events";
import { and, eq, isNull } from "drizzle-orm";

import type {
	Db,
	ListingPublicationRow,
	ListingRow,
	PublishListingInput,
} from "./types";

export interface PublicationMutationContext {
	actorUserId?: string;
	eventBus?: EventBus;
}

export const emitPublicationReadinessChanged = async (
	organizationId: string,
	listingId: string,
	publicationId: string | null,
	isReady: boolean,
	context?: PublicationMutationContext,
): Promise<void> => {
	if (!context?.eventBus) {
		return;
	}

	await context.eventBus.emit({
		type: "listing:organization-publication-readiness-changed",
		organizationId,
		actorUserId: context.actorUserId,
		idempotencyKey: `listing:publication-readiness:${organizationId}:${listingId}:${publicationId ?? "none"}:${isReady ? "ready" : "not-ready"}`,
		data: {
			isReady,
			listingId,
			publicationId,
		},
	});
};

export async function applyPublishListingState(
	input: PublishListingInput,
	db: Db,
): Promise<{ listing: ListingRow; publication: ListingPublicationRow }> {
	const channelType = input.channelType ?? "platform_marketplace";

	// Verify listing exists and belongs to org
	const [existingListing] = await db
		.select()
		.from(listing)
		.where(
			and(
				eq(listing.id, input.listingId),
				eq(listing.organizationId, input.organizationId),
			),
		)
		.limit(1);

	if (!existingListing) {
		throw new Error("NOT_FOUND");
	}

	// Update listing status to active
	const [updatedListing] = await db
		.update(listing)
		.set({ status: "active", isActive: true })
		.where(eq(listing.id, input.listingId))
		.returning();

	if (!updatedListing) {
		throw new Error("Update failed");
	}

	// Upsert listingPublication (check/insert-or-update for platform_marketplace with no channelId)
	const [existingPub] = await db
		.select()
		.from(listingPublication)
		.where(
			and(
				eq(listingPublication.listingId, input.listingId),
				eq(listingPublication.channelType, channelType),
				isNull(listingPublication.channelId),
			),
		)
		.limit(1);

	let pub: ListingPublicationRow;

	if (existingPub) {
		const [updated] = await db
			.update(listingPublication)
			.set({ isActive: true })
			.where(eq(listingPublication.id, existingPub.id))
			.returning();
		if (!updated) {
			throw new Error("Publication update failed");
		}
		pub = updated;
	} else {
		const [inserted] = await db
			.insert(listingPublication)
			.values({
				id: crypto.randomUUID(),
				listingId: input.listingId,
				organizationId: input.organizationId,
				channelType,
				isActive: true,
				visibility: "public",
				merchantType: "platform",
			})
			.returning();
		if (!inserted) {
			throw new Error("Publication insert failed");
		}
		pub = inserted;
	}

	return { listing: updatedListing, publication: pub };
}

export async function applyUnpublishListingState(
	listingId: string,
	organizationId: string,
	db: Db,
): Promise<ListingRow> {
	// Verify listing exists and belongs to org
	const [existingListing] = await db
		.select()
		.from(listing)
		.where(
			and(
				eq(listing.id, listingId),
				eq(listing.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!existingListing) {
		throw new Error("NOT_FOUND");
	}

	// Update listing status to inactive
	const [updatedListing] = await db
		.update(listing)
		.set({ status: "inactive", isActive: false })
		.where(eq(listing.id, listingId))
		.returning();

	if (!updatedListing) {
		throw new Error("Update failed");
	}

	// Set all publications inactive
	await db
		.update(listingPublication)
		.set({ isActive: false })
		.where(eq(listingPublication.listingId, listingId));

	return updatedListing;
}

export async function publishListing(
	input: PublishListingInput,
	db: Db,
	context?: PublicationMutationContext,
): Promise<{ listing: ListingRow; publication: ListingPublicationRow }> {
	const result = await applyPublishListingState(input, db);

	await emitPublicationReadinessChanged(
		input.organizationId,
		input.listingId,
		result.publication.id,
		true,
		context,
	);

	return result;
}

export async function unpublishListing(
	listingId: string,
	organizationId: string,
	db: Db,
	context?: PublicationMutationContext,
): Promise<ListingRow> {
	const result = await applyUnpublishListingState(
		listingId,
		organizationId,
		db,
	);

	await emitPublicationReadinessChanged(
		organizationId,
		listingId,
		null,
		false,
		context,
	);

	return result;
}
