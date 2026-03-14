import { db as defaultDb } from "@my-app/db";
import { listing, listingPublication } from "@my-app/db/schema/marketplace";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { ensureOrganizationListingExists } from "../moderation/repository";
import type {
	Db,
	OrganizationDistributionSummary,
	OrganizationListingDistributionState,
	OrganizationPublicationChannelType,
	OrganizationPublishingSummary,
} from "../types";

export async function resolveOrganizationPublishingSummary(
	organizationId: string,
	db: Db = defaultDb,
): Promise<OrganizationPublishingSummary> {
	const [
		totalRow,
		draftRow,
		publishedRow,
		unpublishedRow,
		activePubRow,
		reviewRow,
	] = await Promise.all([
		db
			.select({ count: count() })
			.from(listing)
			.where(eq(listing.organizationId, organizationId)),
		db
			.select({ count: count() })
			.from(listing)
			.where(
				and(
					eq(listing.organizationId, organizationId),
					eq(listing.status, "draft"),
				),
			),
		db
			.select({
				count: sql<number>`count(distinct ${listingPublication.listingId})`,
			})
			.from(listingPublication)
			.where(
				and(
					eq(listingPublication.organizationId, organizationId),
					eq(listingPublication.isActive, true),
				),
			),
		db
			.select({ count: count() })
			.from(listing)
			.where(
				and(
					eq(listing.organizationId, organizationId),
					eq(listing.status, "inactive"),
				),
			),
		db
			.select({ count: count() })
			.from(listingPublication)
			.where(
				and(
					eq(listingPublication.organizationId, organizationId),
					eq(listingPublication.isActive, true),
				),
			),
		db
			.select({
				count: sql<number>`count(distinct ${listing.id})`,
			})
			.from(listing)
			.innerJoin(
				listingPublication,
				and(
					eq(listingPublication.listingId, listing.id),
					eq(listingPublication.isActive, true),
				),
			)
			.where(
				and(
					eq(listing.organizationId, organizationId),
					isNull(listing.approvedAt),
				),
			),
	]);

	return {
		totalListingCount: Number(totalRow[0]?.count ?? 0),
		draftListingCount: Number(draftRow[0]?.count ?? 0),
		publishedListingCount: Number(publishedRow[0]?.count ?? 0),
		unpublishedListingCount: Number(unpublishedRow[0]?.count ?? 0),
		activePublicationCount: Number(activePubRow[0]?.count ?? 0),
		reviewPendingCount: Number(reviewRow[0]?.count ?? 0),
	};
}

export async function resolveOrganizationDistributionSummary(
	organizationId: string,
	db: Db = defaultDb,
): Promise<OrganizationDistributionSummary> {
	const [ownSiteRow, marketplaceRow, noPublicationRow] = await Promise.all([
		db
			.select({ count: count() })
			.from(listingPublication)
			.where(
				and(
					eq(listingPublication.organizationId, organizationId),
					eq(listingPublication.isActive, true),
					eq(listingPublication.channelType, "own_site"),
				),
			),
		db
			.select({ count: count() })
			.from(listingPublication)
			.where(
				and(
					eq(listingPublication.organizationId, organizationId),
					eq(listingPublication.isActive, true),
					eq(listingPublication.channelType, "platform_marketplace"),
				),
			),
		db
			.select({ count: count() })
			.from(listing)
			.where(
				and(
					eq(listing.organizationId, organizationId),
					sql`not exists (
						select 1
						from ${listingPublication}
						where ${listingPublication.listingId} = ${listing.id}
							and ${listingPublication.organizationId} = ${organizationId}
							and ${listingPublication.isActive} = true
					)`,
				),
			),
	]);

	return {
		ownSitePublicationCount: Number(ownSiteRow[0]?.count ?? 0),
		marketplacePublicationCount: Number(marketplaceRow[0]?.count ?? 0),
		listingsWithoutPublicationCount: Number(noPublicationRow[0]?.count ?? 0),
	};
}

export async function resolveOrganizationListingDistributionState(
	listingId: string,
	organizationId: string,
	db: Db = defaultDb,
): Promise<OrganizationListingDistributionState> {
	await ensureOrganizationListingExists(listingId, organizationId, db);

	const rows = await db
		.select({
			channelType: listingPublication.channelType,
		})
		.from(listingPublication)
		.where(
			and(
				eq(listingPublication.listingId, listingId),
				eq(listingPublication.organizationId, organizationId),
				eq(listingPublication.isActive, true),
			),
		);

	const activeChannels = rows.map((row) => row.channelType);
	const supportedChannels = activeChannels.filter(
		(channelType): channelType is OrganizationPublicationChannelType =>
			channelType === "own_site" || channelType === "platform_marketplace",
	);

	return {
		listingId,
		activeChannels: supportedChannels,
		activePublicationCount: supportedChannels.length,
		isPublished: supportedChannels.length > 0,
	};
}
