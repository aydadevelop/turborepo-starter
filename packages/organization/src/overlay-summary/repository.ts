import { db as defaultDb } from "@my-app/db";
import { listingCalendarConnection } from "@my-app/db/schema/availability";
import {
	listing,
	listingAsset,
	listingPricingProfile,
} from "@my-app/db/schema/marketplace";
import { and, count, eq, sql } from "drizzle-orm";

import type { Db, OrganizationBlockerSummary } from "../types";

export async function resolveOrganizationBlockerSummary(
	organizationId: string,
	db: Db = defaultDb
): Promise<OrganizationBlockerSummary> {
	const [
		missingLocationRow,
		missingImageRow,
		missingCalendarRow,
		missingPricingRow,
	] = await Promise.all([
		db
			.select({ count: count() })
			.from(listing)
			.where(
				and(
					eq(listing.organizationId, organizationId),
					sql`${listing.locationId} is null`
				)
			),
		db
			.select({ count: count() })
			.from(listing)
			.where(
				and(
					eq(listing.organizationId, organizationId),
					sql`not exists (
							select 1
							from ${listingAsset}
							where ${listingAsset.listingId} = ${listing.id}
								and ${listingAsset.kind} = 'image'
								and ${listingAsset.isPrimary} = true
						)`
				)
			),
		db
			.select({ count: count() })
			.from(listing)
			.where(
				and(
					eq(listing.organizationId, organizationId),
					sql`not exists (
							select 1
							from ${listingCalendarConnection}
							where ${listingCalendarConnection.listingId} = ${listing.id}
								and ${listingCalendarConnection.organizationId} = ${organizationId}
								and ${listingCalendarConnection.isActive} = true
								and ${listingCalendarConnection.externalCalendarId} is not null
						)`
				)
			),
		db
			.select({ count: count() })
			.from(listing)
			.where(
				and(
					eq(listing.organizationId, organizationId),
					sql`not exists (
							select 1
							from ${listingPricingProfile}
							where ${listingPricingProfile.listingId} = ${listing.id}
								and ${listingPricingProfile.archivedAt} is null
						)`
				)
			),
	]);

	const missingLocationCount = Number(missingLocationRow[0]?.count ?? 0);
	const missingPrimaryImageCount = Number(missingImageRow[0]?.count ?? 0);
	const missingCalendarCount = Number(missingCalendarRow[0]?.count ?? 0);
	const missingPricingCount = Number(missingPricingRow[0]?.count ?? 0);

	return {
		missingCalendarCount,
		missingLocationCount,
		missingPricingCount,
		missingPrimaryImageCount,
		totalBlockingIssues:
			missingCalendarCount +
			missingLocationCount +
			missingPricingCount +
			missingPrimaryImageCount,
	};
}
