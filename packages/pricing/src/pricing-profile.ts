import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { listingPricingProfile } from "@my-app/db/schema/marketplace";
import type { Db, PricingProfileRow } from "./types";

/**
 * Find the active pricing profile for a listing at a given start time.
 *
 * Active = not archived, validFrom ≤ startsAt, (validTo > startsAt OR validTo is null).
 * Prefers non-default profiles over defaults; among ties, prefers the most recent validFrom.
 *
 * Throws if no active profile exists.
 */
export const resolveActivePricingProfile = async (
	params: {
		listingId: string;
		startsAt: Date;
	},
	db: Db,
): Promise<PricingProfileRow> => {
	const [activeProfile] = await db
		.select()
		.from(listingPricingProfile)
		.where(
			and(
				eq(listingPricingProfile.listingId, params.listingId),
				isNull(listingPricingProfile.archivedAt),
				lte(listingPricingProfile.validFrom, params.startsAt),
				or(
					isNull(listingPricingProfile.validTo),
					gt(listingPricingProfile.validTo, params.startsAt),
				),
			),
		)
		.orderBy(
			desc(listingPricingProfile.isDefault),
			desc(listingPricingProfile.validFrom),
		)
		.limit(1);

	if (!activeProfile) {
		throw new Error(
			`PRICING_PROFILE_NOT_FOUND: No active pricing profile for listing ${params.listingId}`,
		);
	}

	return activeProfile;
};
