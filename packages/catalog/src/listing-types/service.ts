import { listOrganizationAvailableListingTypes } from "./repository";
import type { Db, ListingTypeOptionsResult } from "../types";

export function listAvailableListingTypes(
	organizationId: string,
	db: Db,
): Promise<ListingTypeOptionsResult> {
	return listOrganizationAvailableListingTypes(organizationId, db);
}
