import {
	listingAsset,
	listingPublication,
	organizationSettings,
} from "@my-app/db/schema/marketplace";
import { resolvePublicObjectUrl } from "@my-app/storage";
import { and, asc, eq, sql } from "drizzle-orm";
import {
	findListingTypeBySlug,
	listOrganizationAvailableListingTypes,
} from "../listing-types/repository";
import { findListingForOrganization } from "../listings/repository";
import {
	getEmptyBoatRentProfileState,
	getEmptyExcursionProfileState,
} from "../service-families";
import { findBoatRentProfile } from "../service-families/boat-rent-state";
import { findExcursionProfile } from "../service-families/excursion-state";
import {
	getServiceFamilyPolicy,
	toListingTypeOption,
} from "../service-family-policy";
import type {
	Db,
	ListingAssetWorkspaceState,
	ListingCreateEditorState,
	ListingWorkspaceState,
	OrganizationSettingsRow,
} from "../types";

export async function findOrganizationSettings(
	organizationId: string,
	db: Db
): Promise<OrganizationSettingsRow | null> {
	const [row] = await db
		.select()
		.from(organizationSettings)
		.where(eq(organizationSettings.organizationId, organizationId))
		.limit(1);

	return row ?? null;
}

export async function getListingCreateEditorState(
	organizationId: string,
	db: Db
): Promise<ListingCreateEditorState> {
	const [listingTypes, settings] = await Promise.all([
		listOrganizationAvailableListingTypes(organizationId, db),
		findOrganizationSettings(organizationId, db),
	]);

	return {
		defaults: {
			timezone: settings?.timezone ?? "UTC",
		},
		listingTypes,
	};
}

export async function resolveListingWorkspaceState(
	id: string,
	organizationId: string,
	db: Db
): Promise<ListingWorkspaceState | null> {
	const listingRow = await findListingForOrganization(id, organizationId, db);
	if (!listingRow) {
		return null;
	}

	const [listingType, publicationRow] = await Promise.all([
		findListingTypeBySlug(listingRow.listingTypeSlug, db),
		db
			.select({
				count: sql<number>`count(*)`,
			})
			.from(listingPublication)
			.where(
				and(
					eq(listingPublication.listingId, id),
					eq(listingPublication.organizationId, organizationId),
					eq(listingPublication.isActive, true)
				)
			)
			.limit(1),
	]);

	const boatRentProfile =
		listingType?.serviceFamily === "boat_rent"
			? ((await findBoatRentProfile(id, organizationId, db)) ??
				getEmptyBoatRentProfileState(id))
			: null;
	const excursionProfile =
		listingType?.serviceFamily === "excursions"
			? ((await findExcursionProfile(id, organizationId, db)) ??
				getEmptyExcursionProfileState(id))
			: null;

	return {
		boatRentProfile,
		excursionProfile,
		listing: listingRow,
		listingType: listingType
			? toListingTypeOption({
					defaultAmenityKeys: listingType.defaultAmenityKeys,
					icon: listingType.icon,
					isDefault: false,
					label: listingType.label,
					metadataJsonSchema: listingType.metadataJsonSchema,
					requiredFields: listingType.requiredFields,
					serviceFamily: listingType.serviceFamily,
					supportedPricingModels: listingType.supportedPricingModels,
					value: listingType.slug,
				})
			: null,
		publication: {
			activePublicationCount: Number(publicationRow[0]?.count ?? 0),
			isPublished: Number(publicationRow[0]?.count ?? 0) > 0,
			requiresReview:
				Number(publicationRow[0]?.count ?? 0) > 0 &&
				listingRow.approvedAt === null,
		},
		serviceFamilyPolicy: listingType
			? getServiceFamilyPolicy(listingType.serviceFamily)
			: null,
	};
}

export async function resolveListingAssetWorkspaceState(
	listingId: string,
	organizationId: string,
	db: Db
): Promise<ListingAssetWorkspaceState | null> {
	const listingRow = await findListingForOrganization(
		listingId,
		organizationId,
		db
	);
	if (!listingRow) {
		return null;
	}

	const rows = await db
		.select({
			id: listingAsset.id,
			kind: listingAsset.kind,
			storageProvider: listingAsset.storageProvider,
			storageKey: listingAsset.storageKey,
			access: listingAsset.access,
			altText: listingAsset.altText,
			isPrimary: listingAsset.isPrimary,
			sortOrder: listingAsset.sortOrder,
		})
		.from(listingAsset)
		.where(eq(listingAsset.listingId, listingId))
		.orderBy(asc(listingAsset.sortOrder), asc(listingAsset.createdAt));

	const items = rows.map((row) => ({
		id: row.id,
		kind: row.kind,
		storageProvider: row.storageProvider,
		storageKey: row.storageKey,
		access: row.access,
		altText: row.altText,
		isPrimary: row.isPrimary,
		sortOrder: row.sortOrder,
		publicUrl:
			row.access === "public"
				? resolvePublicObjectUrl(row.storageProvider, {
						access: row.access,
						key: row.storageKey,
					})
				: null,
	}));

	return {
		items,
		totalCount: items.length,
		imageCount: items.filter((item) => item.kind === "image").length,
		documentCount: items.filter((item) => item.kind === "document").length,
		primaryImageId:
			items.find((item) => item.kind === "image" && item.isPrimary)?.id ?? null,
	};
}
