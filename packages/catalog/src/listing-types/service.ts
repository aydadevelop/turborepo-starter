import type { Db, ListingTypeOptionsResult } from "../types";
import { listOrganizationAvailableListingTypes } from "./repository";

export function listAvailableListingTypes(
	organizationId: string,
	db: Db,
): Promise<ListingTypeOptionsResult> {
	return listOrganizationAvailableListingTypes(organizationId, db);
}
