import {
	listing,
	listingTypeConfig,
	organizationListingType,
} from "@my-app/db/schema/marketplace";
import { and, asc, count, desc, eq } from "drizzle-orm";

import type {
	Db,
	ListingInsert,
	ListingTypeOption,
	ListingRow,
	ListingTypeRow,
	ListingTypeOptionsResult,
	ListListingsInput,
	UpdateListingInput,
} from "./types";

export async function findListingTypeBySlug(
	listingTypeSlug: string,
	db: Db
): Promise<ListingTypeRow | null> {
	const [row] = await db
		.select()
		.from(listingTypeConfig)
		.where(eq(listingTypeConfig.slug, listingTypeSlug))
		.limit(1);

	return row ?? null;
}

export async function findOrganizationListingType(
	organizationId: string,
	listingTypeSlug: string,
	db: Db
): Promise<{ id: string } | null> {
	const [row] = await db
		.select({ id: organizationListingType.id })
		.from(organizationListingType)
		.where(
			and(
				eq(organizationListingType.organizationId, organizationId),
				eq(organizationListingType.listingTypeSlug, listingTypeSlug)
			)
		)
		.limit(1);

	return row ?? null;
}

export async function organizationHasListingTypeConfig(
	organizationId: string,
	db: Db
): Promise<boolean> {
	const [row] = await db
		.select({ count: count() })
		.from(organizationListingType)
		.where(eq(organizationListingType.organizationId, organizationId));

	return Number(row?.count ?? 0) > 0;
}

export function listActivePlatformListingTypes(
	db: Db
): Promise<ListingTypeOption[]> {
	return db
		.select({
			icon: listingTypeConfig.icon,
			label: listingTypeConfig.label,
			metadataJsonSchema: listingTypeConfig.metadataJsonSchema,
			value: listingTypeConfig.slug,
		})
		.from(listingTypeConfig)
		.where(eq(listingTypeConfig.isActive, true))
		.orderBy(
			asc(listingTypeConfig.sortOrder),
			asc(listingTypeConfig.label),
			asc(listingTypeConfig.slug)
		)
		.then((rows) =>
			rows.map((row) => ({
				icon: row.icon,
				isDefault: false,
				label: row.label,
				metadataJsonSchema: row.metadataJsonSchema,
				value: row.value,
			}))
		);
}

export async function listOrganizationAvailableListingTypes(
	organizationId: string,
	db: Db
): Promise<ListingTypeOptionsResult> {
	const hasOrgSpecificTypes = await organizationHasListingTypeConfig(
		organizationId,
		db
	);

	if (!hasOrgSpecificTypes) {
		return {
			defaultValue: null,
			items: await listActivePlatformListingTypes(db),
		};
	}

	const rows = await db
		.select({
			icon: listingTypeConfig.icon,
			isDefault: organizationListingType.isDefault,
			label: listingTypeConfig.label,
			metadataJsonSchema: listingTypeConfig.metadataJsonSchema,
			value: listingTypeConfig.slug,
		})
		.from(organizationListingType)
		.innerJoin(
			listingTypeConfig,
			eq(organizationListingType.listingTypeSlug, listingTypeConfig.slug)
		)
		.where(
			and(
				eq(organizationListingType.organizationId, organizationId),
				eq(listingTypeConfig.isActive, true)
			)
		)
		.orderBy(
			asc(organizationListingType.isDefault),
			asc(listingTypeConfig.sortOrder),
			asc(listingTypeConfig.label),
			asc(listingTypeConfig.slug)
		);

	const items = rows
		.map((row) => ({
			icon: row.icon,
			isDefault: row.isDefault,
			label: row.label,
			metadataJsonSchema: row.metadataJsonSchema,
			value: row.value,
		}))
		.sort((left, right) => {
			if (left.isDefault === right.isDefault) {
				return left.label.localeCompare(right.label);
			}
			return left.isDefault ? -1 : 1;
		});

	return {
		defaultValue: items.find((item) => item.isDefault)?.value ?? null,
		items,
	};
}

export async function insertListing(
	values: ListingInsert,
	db: Db
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
	db: Db
): Promise<ListingRow | null> {
	const [row] = await db
		.update(listing)
		.set(updates)
		.where(
			and(
				eq(listing.id, input.id),
				eq(listing.organizationId, input.organizationId)
			)
		)
		.returning();

	return row ?? null;
}

export function listListingsForOrganization(
	input: ListListingsInput,
	db: Db
): Promise<ListingRow[]> {
	return db
		.select()
		.from(listing)
		.where(eq(listing.organizationId, input.organizationId))
		.orderBy(desc(listing.createdAt))
		.limit(input.limit ?? 20)
		.offset(input.offset ?? 0);
}

export async function findListingForOrganization(
	id: string,
	organizationId: string,
	db: Db
): Promise<ListingRow | null> {
	const [row] = await db
		.select()
		.from(listing)
		.where(and(eq(listing.id, id), eq(listing.organizationId, organizationId)))
		.limit(1);

	return row ?? null;
}
