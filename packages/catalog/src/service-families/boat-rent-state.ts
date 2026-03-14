import { listingBoatRentProfile } from "@my-app/db/schema/marketplace";
import { and, eq } from "drizzle-orm";

import type {
	Db,
	ListingBoatRentProfileInput,
	ListingBoatRentProfileRow,
	ListingBoatRentProfileState,
} from "../types";
import { normalizeBoatRentProfileInput } from "./boat-rent";

const toBoatRentProfileState = (
	row: ListingBoatRentProfileRow
): ListingBoatRentProfileState => ({
	listingId: row.listingId,
	capacity: row.capacity,
	captainMode: row.captainMode,
	basePort: row.basePort,
	departureArea: row.departureArea,
	fuelPolicy: row.fuelPolicy,
	depositRequired: row.depositRequired,
	instantBookAllowed: row.instantBookAllowed,
});

export async function findBoatRentProfile(
	listingId: string,
	organizationId: string,
	db: Db
): Promise<ListingBoatRentProfileState | null> {
	const [row] = await db
		.select()
		.from(listingBoatRentProfile)
		.where(
			and(
				eq(listingBoatRentProfile.listingId, listingId),
				eq(listingBoatRentProfile.organizationId, organizationId)
			)
		)
		.limit(1);

	return row ? toBoatRentProfileState(row) : null;
}

export async function upsertBoatRentProfile(
	input: {
		listingId: string;
		organizationId: string;
		profile?: ListingBoatRentProfileInput | null;
	},
	db: Db
): Promise<ListingBoatRentProfileState> {
	const normalized = normalizeBoatRentProfileInput(input.profile);
	const [row] = await db
		.insert(listingBoatRentProfile)
		.values({
			listingId: input.listingId,
			organizationId: input.organizationId,
			capacity: normalized.capacity ?? null,
			captainMode: normalized.captainMode,
			basePort: normalized.basePort ?? null,
			departureArea: normalized.departureArea ?? null,
			fuelPolicy: normalized.fuelPolicy,
			depositRequired: normalized.depositRequired,
			instantBookAllowed: normalized.instantBookAllowed,
		})
		.onConflictDoUpdate({
			target: [listingBoatRentProfile.listingId],
			set: {
				organizationId: input.organizationId,
				capacity: normalized.capacity ?? null,
				captainMode: normalized.captainMode,
				basePort: normalized.basePort ?? null,
				departureArea: normalized.departureArea ?? null,
				fuelPolicy: normalized.fuelPolicy,
				depositRequired: normalized.depositRequired,
				instantBookAllowed: normalized.instantBookAllowed,
				updatedAt: new Date(),
			},
		})
		.returning();

	if (!row) {
		throw new Error("UPSERT_BOAT_RENT_PROFILE_FAILED");
	}

	return toBoatRentProfileState(row);
}
