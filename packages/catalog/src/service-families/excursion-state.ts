import { listingExcursionProfile } from "@my-app/db/schema/marketplace";
import { and, eq } from "drizzle-orm";

import type {
	Db,
	ListingExcursionProfileInput,
	ListingExcursionProfileRow,
	ListingExcursionProfileState,
} from "../types";
import { normalizeExcursionProfileInput } from "./excursions";

const toExcursionProfileState = (
	row: ListingExcursionProfileRow
): ListingExcursionProfileState => ({
	listingId: row.listingId,
	meetingPoint: row.meetingPoint,
	durationMinutes: row.durationMinutes,
	groupFormat: row.groupFormat,
	maxGroupSize: row.maxGroupSize,
	primaryLanguage: row.primaryLanguage,
	ticketsIncluded: row.ticketsIncluded,
	childFriendly: row.childFriendly,
	instantBookAllowed: row.instantBookAllowed,
});

export async function findExcursionProfile(
	listingId: string,
	organizationId: string,
	db: Db
): Promise<ListingExcursionProfileState | null> {
	const [row] = await db
		.select()
		.from(listingExcursionProfile)
		.where(
			and(
				eq(listingExcursionProfile.listingId, listingId),
				eq(listingExcursionProfile.organizationId, organizationId)
			)
		)
		.limit(1);

	return row ? toExcursionProfileState(row) : null;
}

export async function upsertExcursionProfile(
	input: {
		listingId: string;
		organizationId: string;
		profile?: ListingExcursionProfileInput | null;
	},
	db: Db
): Promise<ListingExcursionProfileState> {
	const normalized = normalizeExcursionProfileInput(input.profile);
	const [row] = await db
		.insert(listingExcursionProfile)
		.values({
			listingId: input.listingId,
			organizationId: input.organizationId,
			meetingPoint: normalized.meetingPoint ?? null,
			durationMinutes: normalized.durationMinutes ?? null,
			groupFormat: normalized.groupFormat,
			maxGroupSize: normalized.maxGroupSize ?? null,
			primaryLanguage: normalized.primaryLanguage ?? null,
			ticketsIncluded: normalized.ticketsIncluded,
			childFriendly: normalized.childFriendly,
			instantBookAllowed: normalized.instantBookAllowed,
		})
		.onConflictDoUpdate({
			target: [listingExcursionProfile.listingId],
			set: {
				organizationId: input.organizationId,
				meetingPoint: normalized.meetingPoint ?? null,
				durationMinutes: normalized.durationMinutes ?? null,
				groupFormat: normalized.groupFormat,
				maxGroupSize: normalized.maxGroupSize ?? null,
				primaryLanguage: normalized.primaryLanguage ?? null,
				ticketsIncluded: normalized.ticketsIncluded,
				childFriendly: normalized.childFriendly,
				instantBookAllowed: normalized.instantBookAllowed,
				updatedAt: new Date(),
			},
		})
		.returning();

	if (!row) {
		throw new Error("UPSERT_EXCURSION_PROFILE_FAILED");
	}

	return toExcursionProfileState(row);
}
