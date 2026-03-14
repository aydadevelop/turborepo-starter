import {
	listing,
	listingPricingProfile,
	listingPricingRule,
} from "@my-app/db/schema/marketplace";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Db, PricingWorkspaceState } from "./types";

async function verifyListingOwnership(
	listingId: string,
	organizationId: string,
	db: Db,
): Promise<void> {
	const [row] = await db
		.select({ id: listing.id })
		.from(listing)
		.where(
			and(
				eq(listing.id, listingId),
				eq(listing.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!row) {
		throw new Error("NOT_FOUND");
	}
}

export async function getPricingWorkspaceState(
	listingId: string,
	organizationId: string,
	db: Db,
): Promise<PricingWorkspaceState> {
	await verifyListingOwnership(listingId, organizationId, db);

	const profiles = await db
		.select()
		.from(listingPricingProfile)
		.where(
			and(
				eq(listingPricingProfile.listingId, listingId),
				isNull(listingPricingProfile.archivedAt),
			),
		);

	const profileIds = profiles.map((profile) => profile.id);
	const rules =
		profileIds.length === 0
			? []
			: await db
					.select()
					.from(listingPricingRule)
					.where(inArray(listingPricingRule.pricingProfileId, profileIds));

	const profileRuleSummaries = profiles.map((profile) => {
		const profileRules = rules.filter(
			(rule) => rule.pricingProfileId === profile.id,
		);
		return {
			profileId: profile.id,
			totalRuleCount: profileRules.length,
			activeRuleCount: profileRules.filter((rule) => rule.isActive).length,
		};
	});

	return {
		profiles,
		profileRuleSummaries,
		defaultProfileId: profiles.find((profile) => profile.isDefault)?.id ?? null,
		hasPricing: profiles.length > 0,
		currencies: [...new Set(profiles.map((profile) => profile.currency))],
		totalRuleCount: rules.length,
		totalActiveRuleCount: rules.filter((rule) => rule.isActive).length,
	};
}
