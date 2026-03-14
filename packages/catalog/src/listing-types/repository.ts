import {
	listingTypeConfig,
	organizationListingType,
} from "@my-app/db/schema/marketplace";
import { and, asc, count, eq } from "drizzle-orm";
import { toListingTypeOption } from "../service-family-policy";
import type { Db, ListingTypeOptionsResult, ListingTypeRow } from "../types";

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

export function listActivePlatformListingTypes(db: Db) {
	return db
		.select({
			defaultAmenityKeys: listingTypeConfig.defaultAmenityKeys,
			icon: listingTypeConfig.icon,
			label: listingTypeConfig.label,
			metadataJsonSchema: listingTypeConfig.metadataJsonSchema,
			requiredFields: listingTypeConfig.requiredFields,
			serviceFamily: listingTypeConfig.serviceFamily,
			supportedPricingModels: listingTypeConfig.supportedPricingModels,
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
			rows.map((row) => toListingTypeOption({ ...row, isDefault: false }))
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
			defaultAmenityKeys: listingTypeConfig.defaultAmenityKeys,
			icon: listingTypeConfig.icon,
			isDefault: organizationListingType.isDefault,
			label: listingTypeConfig.label,
			metadataJsonSchema: listingTypeConfig.metadataJsonSchema,
			requiredFields: listingTypeConfig.requiredFields,
			serviceFamily: listingTypeConfig.serviceFamily,
			supportedPricingModels: listingTypeConfig.supportedPricingModels,
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
		.map((row) => toListingTypeOption(row))
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
