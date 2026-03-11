import {
	CATALOG_ERROR_CODES,
	CatalogError,
	rethrowCatalogPersistenceError,
} from "./errors";
import {
	findListingForOrganization,
	findListingTypeBySlug,
	findOrganizationListingType,
	insertListing,
	listOrganizationAvailableListingTypes,
	listListingsForOrganization,
	organizationHasListingTypeConfig,
	updateListingRow,
} from "./repository";
import type {
	CreateListingInput,
	Db,
	ListingInsert,
	ListingRow,
	ListingTypeOptionsResult,
	ListListingsInput,
	UpdateListingInput,
} from "./types";

async function assertListingTypeAvailableForOrganization(
	input: Pick<CreateListingInput, "organizationId" | "listingTypeSlug">,
	db: Db
): Promise<void> {
	const [typeRow, hasOrgSpecificTypes, orgTypeRow] = await Promise.all([
		findListingTypeBySlug(input.listingTypeSlug, db),
		organizationHasListingTypeConfig(input.organizationId, db),
		findOrganizationListingType(
			input.organizationId,
			input.listingTypeSlug,
			db
		),
	]);

	if (!typeRow) {
		throw new CatalogError(CATALOG_ERROR_CODES.listingTypeNotFound);
	}

	if (!typeRow.isActive) {
		throw new CatalogError(CATALOG_ERROR_CODES.listingTypeInactive);
	}

	if (hasOrgSpecificTypes && !orgTypeRow) {
		throw new CatalogError(CATALOG_ERROR_CODES.listingTypeNotEnabled);
	}
}

export async function createListing(
	input: CreateListingInput,
	db: Db
): Promise<ListingRow> {
	await assertListingTypeAvailableForOrganization(input, db);

	try {
		return await insertListing(
			{
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
			},
			db
		);
	} catch (error) {
		return rethrowCatalogPersistenceError(error);
	}
}

export async function updateListing(
	input: UpdateListingInput,
	db: Db
): Promise<ListingRow> {
	const updates: Partial<ListingInsert> = {};
	if (input.name !== undefined) {
		updates.name = input.name;
	}
	if (input.description !== undefined) {
		updates.description = input.description;
	}
	if (input.metadata !== undefined) {
		updates.metadata = input.metadata;
	}
	if (input.timezone !== undefined) {
		updates.timezone = input.timezone;
	}

	const row = await updateListingRow(input, updates, db);

	if (!row) {
		throw new CatalogError(CATALOG_ERROR_CODES.notFound);
	}
	return row;
}

export function listListings(
	input: ListListingsInput,
	db: Db
): Promise<ListingRow[]> {
	return listListingsForOrganization(input, db);
}

export function listAvailableListingTypes(
	organizationId: string,
	db: Db
): Promise<ListingTypeOptionsResult> {
	return listOrganizationAvailableListingTypes(organizationId, db);
}

export async function getListing(
	id: string,
	organizationId: string,
	db: Db
): Promise<ListingRow> {
	const row = await findListingForOrganization(id, organizationId, db);

	if (!row) {
		throw new CatalogError(CATALOG_ERROR_CODES.notFound);
	}
	return row;
}
