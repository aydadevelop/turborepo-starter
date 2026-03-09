import { and, desc, eq } from "drizzle-orm";
import { listing } from "@my-app/db/schema/marketplace";

import type {
	CreateListingInput,
	Db,
	ListListingsInput,
	ListingRow,
	UpdateListingInput,
} from "./types";

export async function createListing(
	input: CreateListingInput,
	db: Db,
): Promise<ListingRow> {
	const [row] = await db
		.insert(listing)
		.values({
			id: crypto.randomUUID(),
			organizationId: input.organizationId,
			listingTypeSlug: input.listingTypeSlug,
			name: input.name,
			slug: input.slug,
			description: input.description,
			metadata: input.metadata,
			timezone: input.timezone ?? "UTC",
			status: "draft",
			isActive: true,
		})
		.returning();

	if (!row) throw new Error("Insert failed");
	return row;
}

export async function updateListing(
	input: UpdateListingInput,
	db: Db,
): Promise<ListingRow> {
	const updates: Partial<typeof listing.$inferInsert> = {};
	if (input.name !== undefined) updates.name = input.name;
	if (input.description !== undefined) updates.description = input.description;
	if (input.metadata !== undefined) updates.metadata = input.metadata;
	if (input.timezone !== undefined) updates.timezone = input.timezone;

	const [row] = await db
		.update(listing)
		.set(updates)
		.where(
			and(
				eq(listing.id, input.id),
				eq(listing.organizationId, input.organizationId),
			),
		)
		.returning();

	if (!row) throw new Error("NOT_FOUND");
	return row;
}

export async function listListings(
	input: ListListingsInput,
	db: Db,
): Promise<ListingRow[]> {
	return db
		.select()
		.from(listing)
		.where(eq(listing.organizationId, input.organizationId))
		.orderBy(desc(listing.createdAt))
		.limit(input.limit ?? 20)
		.offset(input.offset ?? 0);
}

export async function getListing(
	id: string,
	organizationId: string,
	db: Db,
): Promise<ListingRow> {
	const [row] = await db
		.select()
		.from(listing)
		.where(and(eq(listing.id, id), eq(listing.organizationId, organizationId)))
		.limit(1);

	if (!row) throw new Error("NOT_FOUND");
	return row;
}
