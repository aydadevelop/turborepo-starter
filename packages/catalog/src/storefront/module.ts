import {
	listing,
	listingAsset,
	listingBoatRentProfile,
	listingExcursionProfile,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { resolvePublicObjectUrl } from "@my-app/storage";
import { and, count, eq, ilike } from "drizzle-orm";
import {
	toStorefrontBoatRentSummary,
	toStorefrontExcursionSummary,
} from "../service-families";
import { getServiceFamilyPolicy } from "../service-family-policy";
import type {
	Db,
	ListingBoatRentCaptainMode,
	ListingBoatRentFuelPolicy,
	ListingExcursionGroupFormat,
	ListingServiceFamilyPolicy,
	ListingTypeRow,
	StorefrontBoatRentSummary,
	StorefrontExcursionSummary,
} from "../types";

export interface StorefrontListInput {
	limit?: number;
	offset?: number;
	q?: string;
	type?: string;
}

export interface StorefrontListItem {
	boatRentSummary: StorefrontBoatRentSummary | null;
	createdAt: string;
	description: string | null;
	excursionSummary: StorefrontExcursionSummary | null;
	id: string;
	listingTypeLabel: string;
	listingTypeSlug: string;
	metadata: Record<string, unknown> | null;
	name: string;
	primaryImageUrl: string | null;
	serviceFamily: ListingTypeRow["serviceFamily"];
	serviceFamilyPolicy: ListingServiceFamilyPolicy;
	slug: string;
}

interface StorefrontRow {
	boatRentBasePort: string | null;
	boatRentCapacity: number | null;
	boatRentCaptainMode: ListingBoatRentCaptainMode | null;
	boatRentDepartureArea: string | null;
	boatRentDepositRequired: boolean | null;
	boatRentFuelPolicy: ListingBoatRentFuelPolicy | null;
	boatRentInstantBookAllowed: boolean | null;
	createdAt: Date;
	description: string | null;
	excursionChildFriendly: boolean | null;
	excursionDurationMinutes: number | null;
	excursionGroupFormat: ListingExcursionGroupFormat | null;
	excursionInstantBookAllowed: boolean | null;
	excursionMaxGroupSize: number | null;
	excursionMeetingPoint: string | null;
	excursionPrimaryLanguage: string | null;
	excursionTicketsIncluded: boolean | null;
	id: string;
	listingTypeLabel: string;
	listingTypeSlug: string;
	metadata: Record<string, unknown> | null;
	name: string;
	primaryImageAccess: "public" | "private" | null;
	primaryImageKey: string | null;
	primaryImageProvider: string | null;
	serviceFamily: ListingTypeRow["serviceFamily"];
	slug: string;
}

const toStorefrontListItem = (row: StorefrontRow): StorefrontListItem => ({
	boatRentSummary:
		row.serviceFamily === "boat_rent"
			? toStorefrontBoatRentSummary({
					listingId: row.id,
					capacity: row.boatRentCapacity,
					captainMode: row.boatRentCaptainMode ?? "captained_only",
					basePort: row.boatRentBasePort,
					departureArea: row.boatRentDepartureArea,
					fuelPolicy: row.boatRentFuelPolicy ?? "included",
					depositRequired: row.boatRentDepositRequired ?? false,
					instantBookAllowed: row.boatRentInstantBookAllowed ?? false,
				})
			: null,
	excursionSummary:
		row.serviceFamily === "excursions"
			? toStorefrontExcursionSummary({
					listingId: row.id,
					meetingPoint: row.excursionMeetingPoint,
					durationMinutes: row.excursionDurationMinutes,
					groupFormat: row.excursionGroupFormat ?? "group",
					maxGroupSize: row.excursionMaxGroupSize,
					primaryLanguage: row.excursionPrimaryLanguage,
					ticketsIncluded: row.excursionTicketsIncluded ?? false,
					childFriendly: row.excursionChildFriendly ?? false,
					instantBookAllowed: row.excursionInstantBookAllowed ?? true,
				})
			: null,
	id: row.id,
	listingTypeSlug: row.listingTypeSlug,
	listingTypeLabel: row.listingTypeLabel,
	serviceFamily: row.serviceFamily,
	serviceFamilyPolicy: getServiceFamilyPolicy(row.serviceFamily),
	name: row.name,
	slug: row.slug,
	description: row.description,
	metadata: row.metadata,
	createdAt: row.createdAt.toISOString(),
	primaryImageUrl:
		row.primaryImageProvider && row.primaryImageKey && row.primaryImageAccess
			? resolvePublicObjectUrl(row.primaryImageProvider, {
					key: row.primaryImageKey,
					access: row.primaryImageAccess,
				})
			: null,
});

function buildWhereClause(input: StorefrontListInput) {
	const conditions = [
		eq(listing.isActive, true),
		...(input.type ? [eq(listing.listingTypeSlug, input.type)] : []),
		...(input.q ? [ilike(listing.name, `%${input.q}%`)] : []),
	];
	return conditions.length === 1 ? conditions[0] : and(...conditions);
}

export async function searchPublishedListings(
	input: StorefrontListInput,
	db: Db,
): Promise<{ items: StorefrontListItem[]; total: number }> {
	const where = buildWhereClause(input);

	const rows = await db
		.select({
			id: listing.id,
			listingTypeSlug: listing.listingTypeSlug,
			listingTypeLabel: listingTypeConfig.label,
			serviceFamily: listingTypeConfig.serviceFamily,
			name: listing.name,
			slug: listing.slug,
			description: listing.description,
			metadata: listing.metadata,
			createdAt: listing.createdAt,
			primaryImageKey: listingAsset.storageKey,
			primaryImageProvider: listingAsset.storageProvider,
			primaryImageAccess: listingAsset.access,
			boatRentCapacity: listingBoatRentProfile.capacity,
			boatRentCaptainMode: listingBoatRentProfile.captainMode,
			boatRentBasePort: listingBoatRentProfile.basePort,
			boatRentDepartureArea: listingBoatRentProfile.departureArea,
			boatRentFuelPolicy: listingBoatRentProfile.fuelPolicy,
			boatRentDepositRequired: listingBoatRentProfile.depositRequired,
			boatRentInstantBookAllowed: listingBoatRentProfile.instantBookAllowed,
			excursionMeetingPoint: listingExcursionProfile.meetingPoint,
			excursionDurationMinutes: listingExcursionProfile.durationMinutes,
			excursionGroupFormat: listingExcursionProfile.groupFormat,
			excursionMaxGroupSize: listingExcursionProfile.maxGroupSize,
			excursionPrimaryLanguage: listingExcursionProfile.primaryLanguage,
			excursionTicketsIncluded: listingExcursionProfile.ticketsIncluded,
			excursionChildFriendly: listingExcursionProfile.childFriendly,
			excursionInstantBookAllowed: listingExcursionProfile.instantBookAllowed,
		})
		.from(listing)
		.innerJoin(
			listingPublication,
			and(
				eq(listingPublication.listingId, listing.id),
				eq(listingPublication.isActive, true),
				eq(listingPublication.channelType, "platform_marketplace"),
			),
		)
		.innerJoin(
			listingTypeConfig,
			eq(listingTypeConfig.slug, listing.listingTypeSlug),
		)
		.leftJoin(
			listingBoatRentProfile,
			eq(listingBoatRentProfile.listingId, listing.id),
		)
		.leftJoin(
			listingExcursionProfile,
			eq(listingExcursionProfile.listingId, listing.id),
		)
		.leftJoin(
			listingAsset,
			and(
				eq(listingAsset.listingId, listing.id),
				eq(listingAsset.isPrimary, true),
				eq(listingAsset.kind, "image"),
			),
		)
		.where(where)
		.orderBy(listing.createdAt)
		.limit(input.limit ?? 20)
		.offset(input.offset ?? 0);

	const [countRow] = await db
		.select({ total: count() })
		.from(listing)
		.innerJoin(
			listingPublication,
			and(
				eq(listingPublication.listingId, listing.id),
				eq(listingPublication.isActive, true),
				eq(listingPublication.channelType, "platform_marketplace"),
			),
		)
		.where(where);

	return {
		items: rows.map(toStorefrontListItem),
		total: countRow?.total ?? 0,
	};
}

export async function getPublishedListing(
	id: string,
	db: Db,
): Promise<StorefrontListItem> {
	const [row] = await db
		.select({
			id: listing.id,
			listingTypeSlug: listing.listingTypeSlug,
			listingTypeLabel: listingTypeConfig.label,
			serviceFamily: listingTypeConfig.serviceFamily,
			name: listing.name,
			slug: listing.slug,
			description: listing.description,
			metadata: listing.metadata,
			createdAt: listing.createdAt,
			primaryImageKey: listingAsset.storageKey,
			primaryImageProvider: listingAsset.storageProvider,
			primaryImageAccess: listingAsset.access,
			boatRentCapacity: listingBoatRentProfile.capacity,
			boatRentCaptainMode: listingBoatRentProfile.captainMode,
			boatRentBasePort: listingBoatRentProfile.basePort,
			boatRentDepartureArea: listingBoatRentProfile.departureArea,
			boatRentFuelPolicy: listingBoatRentProfile.fuelPolicy,
			boatRentDepositRequired: listingBoatRentProfile.depositRequired,
			boatRentInstantBookAllowed: listingBoatRentProfile.instantBookAllowed,
			excursionMeetingPoint: listingExcursionProfile.meetingPoint,
			excursionDurationMinutes: listingExcursionProfile.durationMinutes,
			excursionGroupFormat: listingExcursionProfile.groupFormat,
			excursionMaxGroupSize: listingExcursionProfile.maxGroupSize,
			excursionPrimaryLanguage: listingExcursionProfile.primaryLanguage,
			excursionTicketsIncluded: listingExcursionProfile.ticketsIncluded,
			excursionChildFriendly: listingExcursionProfile.childFriendly,
			excursionInstantBookAllowed: listingExcursionProfile.instantBookAllowed,
		})
		.from(listing)
		.innerJoin(
			listingPublication,
			and(
				eq(listingPublication.listingId, listing.id),
				eq(listingPublication.isActive, true),
				eq(listingPublication.channelType, "platform_marketplace"),
			),
		)
		.innerJoin(
			listingTypeConfig,
			eq(listingTypeConfig.slug, listing.listingTypeSlug),
		)
		.leftJoin(
			listingBoatRentProfile,
			eq(listingBoatRentProfile.listingId, listing.id),
		)
		.leftJoin(
			listingExcursionProfile,
			eq(listingExcursionProfile.listingId, listing.id),
		)
		.leftJoin(
			listingAsset,
			and(
				eq(listingAsset.listingId, listing.id),
				eq(listingAsset.isPrimary, true),
				eq(listingAsset.kind, "image"),
			),
		)
		.where(and(eq(listing.id, id), eq(listing.isActive, true)))
		.limit(1);

	if (!row) {
		throw new Error("NOT_FOUND");
	}

	return toStorefrontListItem(row);
}
