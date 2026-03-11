import { and, count, eq, ilike } from "drizzle-orm";
import {
	listing,
	listingAsset,
	listingPublication,
} from "@my-app/db/schema/marketplace";
import { resolvePublicObjectUrl } from "@my-app/storage";

import type { Db } from "./types";

export interface StorefrontListInput {
	type?: string;
	q?: string;
	limit?: number;
	offset?: number;
}

export interface StorefrontListItem {
	id: string;
	listingTypeSlug: string;
	name: string;
	slug: string;
	description: string | null;
	metadata: Record<string, unknown> | null;
	primaryImageUrl: string | null;
	createdAt: string;
}

interface StorefrontRow {
	id: string;
	listingTypeSlug: string;
	name: string;
	slug: string;
	description: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	primaryImageAccess: "public" | "private" | null;
	primaryImageKey: string | null;
	primaryImageProvider: string | null;
}

const toStorefrontListItem = (row: StorefrontRow): StorefrontListItem => ({
	id: row.id,
	listingTypeSlug: row.listingTypeSlug,
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
			name: listing.name,
				slug: listing.slug,
				description: listing.description,
				metadata: listing.metadata,
				createdAt: listing.createdAt,
				primaryImageKey: listingAsset.storageKey,
				primaryImageProvider: listingAsset.storageProvider,
				primaryImageAccess: listingAsset.access,
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
			name: listing.name,
				slug: listing.slug,
				description: listing.description,
				metadata: listing.metadata,
				createdAt: listing.createdAt,
				primaryImageKey: listingAsset.storageKey,
				primaryImageProvider: listingAsset.storageProvider,
				primaryImageAccess: listingAsset.access,
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

	if (!row) throw new Error("NOT_FOUND");

	return toStorefrontListItem(row);
}
