import {
	CATALOG_ERROR_CODES,
	CatalogError,
	rethrowCatalogPersistenceError,
} from "../errors";
import {
	findListingTypeBySlug,
	findOrganizationListingType,
	organizationHasListingTypeConfig,
} from "../listing-types/repository";
import { upsertBoatRentProfile } from "../service-families/boat-rent-state";
import { upsertExcursionProfile } from "../service-families/excursion-state";
import type {
	CreateListingInput,
	Db,
	ListingCollectionResult,
	ListingInsert,
	ListingRow,
	ListListingsInput,
	UpdateListingInput,
} from "../types";
import {
	findListingForOrganization,
	insertListing,
	listListingsForOrganization,
	updateListingRow,
} from "./repository";

async function assertListingTypeAvailableForOrganization(
	input: Pick<CreateListingInput, "organizationId" | "listingTypeSlug">,
	db: Db,
): Promise<NonNullable<Awaited<ReturnType<typeof findListingTypeBySlug>>>> {
	const [typeRow, hasOrgSpecificTypes, orgTypeRow] = await Promise.all([
		findListingTypeBySlug(input.listingTypeSlug, db),
		organizationHasListingTypeConfig(input.organizationId, db),
		findOrganizationListingType(
			input.organizationId,
			input.listingTypeSlug,
			db,
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

	return typeRow;
}

function assertServiceFamilyDetailsCompatibility(
	serviceFamily: NonNullable<
		Awaited<ReturnType<typeof findListingTypeBySlug>>
	>["serviceFamily"],
	input:
		| Pick<CreateListingInput, "serviceFamilyDetails">
		| Pick<UpdateListingInput, "serviceFamilyDetails">,
) {
	if (serviceFamily !== "boat_rent" && input.serviceFamilyDetails?.boatRent) {
		throw new CatalogError(CATALOG_ERROR_CODES.listingFamilyDetailsMismatch);
	}
	if (serviceFamily !== "excursions" && input.serviceFamilyDetails?.excursion) {
		throw new CatalogError(CATALOG_ERROR_CODES.listingFamilyDetailsMismatch);
	}
}

export async function createListing(
	input: CreateListingInput,
	db: Db,
): Promise<ListingRow> {
	const typeRow = await assertListingTypeAvailableForOrganization(input, db);
	assertServiceFamilyDetailsCompatibility(typeRow.serviceFamily, input);

	try {
		return await db.transaction(async (tx) => {
			const transactionDb = tx as unknown as Db;
			const row = await insertListing(
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
				transactionDb,
			);

			if (typeRow.serviceFamily === "boat_rent") {
				await upsertBoatRentProfile(
					{
						listingId: row.id,
						organizationId: row.organizationId,
						profile: input.serviceFamilyDetails?.boatRent,
					},
					transactionDb,
				);
			}
			if (typeRow.serviceFamily === "excursions") {
				await upsertExcursionProfile(
					{
						listingId: row.id,
						organizationId: row.organizationId,
						profile: input.serviceFamilyDetails?.excursion,
					},
					transactionDb,
				);
			}

			return row;
		});
	} catch (error) {
		return rethrowCatalogPersistenceError(error);
	}
}

export async function updateListing(
	input: UpdateListingInput,
	db: Db,
): Promise<ListingRow> {
	const current = await findListingForOrganization(
		input.id,
		input.organizationId,
		db,
	);
	if (!current) {
		throw new CatalogError(CATALOG_ERROR_CODES.notFound);
	}

	const typeRow = await findListingTypeBySlug(current.listingTypeSlug, db);
	if (!typeRow) {
		throw new CatalogError(CATALOG_ERROR_CODES.listingTypeNotFound);
	}

	assertServiceFamilyDetailsCompatibility(typeRow.serviceFamily, input);

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

	const row = await db.transaction(async (tx) => {
		const transactionDb = tx as unknown as Db;
		const updated =
			Object.keys(updates).length > 0
				? await updateListingRow(input, updates, transactionDb)
				: current;

		if (!updated) {
			return null;
		}

		if (typeRow.serviceFamily === "boat_rent" && input.serviceFamilyDetails) {
			await upsertBoatRentProfile(
				{
					listingId: updated.id,
					organizationId: updated.organizationId,
					profile: input.serviceFamilyDetails.boatRent,
				},
				transactionDb,
			);
		}
		if (typeRow.serviceFamily === "excursions" && input.serviceFamilyDetails) {
			await upsertExcursionProfile(
				{
					listingId: updated.id,
					organizationId: updated.organizationId,
					profile: input.serviceFamilyDetails.excursion,
				},
				transactionDb,
			);
		}

		return updated;
	});

	if (!row) {
		throw new CatalogError(CATALOG_ERROR_CODES.notFound);
	}

	return row;
}

export function listListings(
	input: ListListingsInput,
	db: Db,
): Promise<ListingCollectionResult> {
	return listListingsForOrganization(input, db);
}

export async function getListing(
	id: string,
	organizationId: string,
	db: Db,
): Promise<ListingRow> {
	const row = await findListingForOrganization(id, organizationId, db);
	if (!row) {
		throw new CatalogError(CATALOG_ERROR_CODES.notFound);
	}

	return row;
}
