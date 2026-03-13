import { and, asc, eq } from "drizzle-orm";
import {
	listingAvailabilityBlock,
	listingAvailabilityException,
	listingAvailabilityRule,
} from "@my-app/db/schema/availability";
import { listing } from "@my-app/db/schema/marketplace";

import type { AvailabilityWorkspaceState, Db } from "./types";

async function verifyListingOwnership(
	listingId: string,
	organizationId: string,
	db: Db
): Promise<void> {
	const [row] = await db
		.select({ id: listing.id })
		.from(listing)
		.where(and(eq(listing.id, listingId), eq(listing.organizationId, organizationId)))
		.limit(1);

	if (!row) {
		throw new Error("NOT_FOUND");
	}
}

export async function getAvailabilityWorkspaceState(
	listingId: string,
	organizationId: string,
	db: Db
): Promise<AvailabilityWorkspaceState> {
	await verifyListingOwnership(listingId, organizationId, db);

	const [rules, blocks, exceptions] = await Promise.all([
		db
			.select()
			.from(listingAvailabilityRule)
			.where(eq(listingAvailabilityRule.listingId, listingId))
			.orderBy(
				asc(listingAvailabilityRule.dayOfWeek),
				asc(listingAvailabilityRule.startMinute)
			),
		db
			.select()
			.from(listingAvailabilityBlock)
			.where(eq(listingAvailabilityBlock.listingId, listingId))
			.orderBy(asc(listingAvailabilityBlock.startsAt)),
		db
			.select()
			.from(listingAvailabilityException)
			.where(eq(listingAvailabilityException.listingId, listingId))
			.orderBy(asc(listingAvailabilityException.date)),
	]);

	return {
		rules,
		blocks,
		exceptions,
		activeRuleCount: rules.filter((rule) => rule.isActive).length,
		activeBlockCount: blocks.filter((block) => block.isActive).length,
		exceptionCount: exceptions.length,
		hasAvailability: rules.some((rule) => rule.isActive),
	};
}
