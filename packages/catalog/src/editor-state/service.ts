import { CATALOG_ERROR_CODES, CatalogError } from "../errors";
import type {
	Db,
	ListingAssetWorkspaceState,
	ListingCreateEditorState,
	ListingWorkspaceState,
} from "../types";
import {
	getListingCreateEditorState,
	resolveListingAssetWorkspaceState,
	resolveListingWorkspaceState,
} from "./repository";

export function getCreateListingEditorState(
	organizationId: string,
	db: Db,
): Promise<ListingCreateEditorState> {
	return getListingCreateEditorState(organizationId, db);
}

export async function getListingWorkspaceState(
	id: string,
	organizationId: string,
	db: Db,
): Promise<ListingWorkspaceState> {
	const state = await resolveListingWorkspaceState(id, organizationId, db);
	if (!state) {
		throw new CatalogError(CATALOG_ERROR_CODES.notFound);
	}
	return state;
}

export async function getListingAssetWorkspaceState(
	id: string,
	organizationId: string,
	db: Db,
): Promise<ListingAssetWorkspaceState> {
	const state = await resolveListingAssetWorkspaceState(id, organizationId, db);
	if (!state) {
		throw new CatalogError(CATALOG_ERROR_CODES.notFound);
	}
	return state;
}
