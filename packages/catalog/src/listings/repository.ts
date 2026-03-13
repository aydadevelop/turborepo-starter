import { listing, listingTypeConfig } from "@my-app/db/schema/marketplace";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import type {
	Db,
	ListingCollectionResult,
	ListingInsert,
	ListingRow,
	ListListingsInput,
	UpdateListingInput,
} from "../types";

export async function insertListing(
	values: ListingInsert,
	db: Db,
): Promise<ListingRow> {
	const [row] = await db.insert(listing).values(values).returning();
	if (!row) {
		throw new Error("Insert failed");
	}

	return row;
}

export async function updateListingRow(
	input: UpdateListingInput,
	updates: Partial<ListingInsert>,
	db: Db,
): Promise<ListingRow | null> {
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

	return row ?? null;
}

export async function listListingsForOrganization(
	input: ListListingsInput,
	db: Db,
): Promise<ListingCollectionResult> {
	const page = input.page ?? { limit: 20, offset: 0 };
	const conditions = [eq(listing.organizationId, input.organizationId)];
	const search = input.search?.trim();

	if (input.filter?.status) {
		conditions.push(eq(listing.status, input.filter.status));
	}

	if (input.filter?.listingTypeSlug) {
		conditions.push(eq(listing.listingTypeSlug, input.filter.listingTypeSlug));
	}

	if (search) {
		conditions.push(
			or(
				ilike(listing.name, `%${search}%`),
				ilike(listing.slug, `%${search}%`),
				ilike(listing.description, `%${search}%`),
			)!,
		);
	}

	const orderBy =
		input.sort?.by === "updated_at"
			? input.sort.dir === "asc"
				? asc(listing.updatedAt)
				: desc(listing.updatedAt)
			: input.sort?.by === "name"
				? input.sort.dir === "asc"
					? asc(listing.name)
					: desc(listing.name)
				: input.sort?.by === "status"
					? input.sort.dir === "asc"
						? asc(listing.status)
						: desc(listing.status)
					: input.sort?.dir === "asc"
						? asc(listing.createdAt)
						: desc(listing.createdAt);

	const useListingTypeJoin = input.filter?.serviceFamily !== undefined;

	if (useListingTypeJoin) {
		conditions.push(
			eq(listingTypeConfig.serviceFamily, input.filter!.serviceFamily!),
		);

		const [itemsResult, countResult] = await Promise.all([
			db
				.select({ row: listing })
				.from(listing)
				.innerJoin(
					listingTypeConfig,
					eq(listingTypeConfig.slug, listing.listingTypeSlug),
				)
				.where(and(...conditions))
				.orderBy(orderBy)
				.limit(page.limit)
				.offset(page.offset),
			db
				.select({ total: count() })
				.from(listing)
				.innerJoin(
					listingTypeConfig,
					eq(listingTypeConfig.slug, listing.listingTypeSlug),
				)
				.where(and(...conditions)),
		]);

		return {
			items: itemsResult.map(({ row }) => row),
			total: countResult[0]?.total ?? 0,
		};
	}

	const [items, countResult] = await Promise.all([
		db
			.select()
			.from(listing)
			.where(and(...conditions))
			.orderBy(orderBy)
			.limit(page.limit)
			.offset(page.offset),
		db.select({ total: count() }).from(listing).where(and(...conditions)),
	]);

	return {
		items,
		total: countResult[0]?.total ?? 0,
	};
}

export async function findListingForOrganization(
	id: string,
	organizationId: string,
	db: Db,
): Promise<ListingRow | null> {
	const [row] = await db
		.select()
		.from(listing)
		.where(and(eq(listing.id, id), eq(listing.organizationId, organizationId)))
		.limit(1);

	return row ?? null;
}
