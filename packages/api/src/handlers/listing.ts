import {
	createListing,
	getCreateListingEditorState,
	getListing,
	getListingAssetWorkspaceState,
	getListingWorkspaceState,
	isCatalogErrorCode,
	type ListingRow,
	listAvailableListingTypes,
	listListings,
	publishListingWorkflow,
	unpublishListingWorkflow,
	updateListing,
} from "@my-app/catalog";
import { db } from "@my-app/db";
import { ORPCError } from "@orpc/server";
import { buildWorkflowContext } from "../context";
import { organizationPermissionProcedure } from "../index";

const formatListing = (row: ListingRow) => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const throwListingRouterError = (error: unknown): never => {
	if (isCatalogErrorCode(error, "NOT_FOUND")) {
		throw new ORPCError("NOT_FOUND");
	}

	if (isCatalogErrorCode(error, "LISTING_TYPE_NOT_FOUND")) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Unknown listing type",
		});
	}

	if (isCatalogErrorCode(error, "LISTING_TYPE_INACTIVE")) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Listing type is inactive",
		});
	}

	if (isCatalogErrorCode(error, "LISTING_TYPE_NOT_ENABLED")) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Listing type is not enabled for this organization",
		});
	}

	if (isCatalogErrorCode(error, "LISTING_FAMILY_DETAILS_MISMATCH")) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Service-family details do not match the selected listing type",
		});
	}

	if (isCatalogErrorCode(error, "LISTING_SLUG_CONFLICT")) {
		throw new ORPCError("CONFLICT", {
			message: "Listing slug already exists for this organization",
		});
	}

	throw error;
};

export const listingRouter = {
	create: organizationPermissionProcedure({
		listing: ["create"],
	}).listing.create.handler(async ({ context, input }) => {
		try {
			const row = await createListing(
				{
					...input,
					organizationId: context.activeMembership.organizationId,
				},
				db,
			);
			return formatListing(row);
		} catch (error) {
			return throwListingRouterError(error);
		}
	}),

	update: organizationPermissionProcedure({
		listing: ["update"],
	}).listing.update.handler(async ({ context, input }) => {
		try {
			const row = await updateListing(
				{
					...input,
					organizationId: context.activeMembership.organizationId,
				},
				db,
			);
			return formatListing(row);
		} catch (error) {
			return throwListingRouterError(error);
		}
	}),

	get: organizationPermissionProcedure({
		listing: ["read"],
	}).listing.get.handler(async ({ context, input }) => {
		try {
			const row = await getListing(
				input.id,
				context.activeMembership.organizationId,
				db,
			);
			return formatListing(row);
		} catch (error) {
			return throwListingRouterError(error);
		}
	}),

	getWorkspaceState: organizationPermissionProcedure({
		listing: ["read"],
	}).listing.getWorkspaceState.handler(async ({ context, input }) => {
		try {
			const state = await getListingWorkspaceState(
				input.id,
				context.activeMembership.organizationId,
				db,
			);

			return {
				boatRentProfile: state.boatRentProfile,
				excursionProfile: state.excursionProfile,
				listing: formatListing(state.listing),
				listingType: state.listingType,
				publication: state.publication,
				serviceFamilyPolicy: state.serviceFamilyPolicy,
			};
		} catch (error) {
			return throwListingRouterError(error);
		}
	}),

	getAssetWorkspaceState: organizationPermissionProcedure({
		listing: ["read"],
	}).listing.getAssetWorkspaceState.handler(async ({ context, input }) => {
		try {
			return await getListingAssetWorkspaceState(
				input.id,
				context.activeMembership.organizationId,
				db,
			);
		} catch (error) {
			return throwListingRouterError(error);
		}
	}),

	list: organizationPermissionProcedure({
		listing: ["read"],
	}).listing.list.handler(async ({ context, input }) => {
		const result = await listListings(
			{
				filter: input.filter,
				organizationId: context.activeMembership.organizationId,
				page: input.page,
				search: input.search,
				sort: input.sort,
			},
			db,
		);
		return {
			items: result.items.map(formatListing),
			page: {
				limit: input.page.limit,
				offset: input.page.offset,
				total: result.total,
				hasMore: input.page.offset + result.items.length < result.total,
			},
		};
	}),

	listAvailableTypes: organizationPermissionProcedure({
		listing: ["read"],
	}).listing.listAvailableTypes.handler(({ context }) => {
		return listAvailableListingTypes(
			context.activeMembership.organizationId,
			db,
		);
	}),

	getCreateEditorState: organizationPermissionProcedure({
		listing: ["read"],
	}).listing.getCreateEditorState.handler(({ context }) => {
		return getCreateListingEditorState(
			context.activeMembership.organizationId,
			db,
		);
	}),

	publish: organizationPermissionProcedure({
		listing: ["update"],
	}).listing.publish.handler(async ({ context, input }) => {
		try {
			const result = await publishListingWorkflow(db).execute(
				{
					listingId: input.id,
					organizationId: context.activeMembership.organizationId,
					channelType: input.channelType ?? undefined,
				},
				buildWorkflowContext(context, `listing:publish:${input.id}`),
			);
			if (!result.success) {
				return throwListingRouterError(result.error);
			}

			const { listing: row } = result.output;
			return formatListing(row);
		} catch (error) {
			return throwListingRouterError(error);
		}
	}),

	unpublish: organizationPermissionProcedure({
		listing: ["update"],
	}).listing.unpublish.handler(async ({ context, input }) => {
		try {
			const result = await unpublishListingWorkflow(db).execute(
				{
					listingId: input.id,
					organizationId: context.activeMembership.organizationId,
				},
				buildWorkflowContext(context, `listing:unpublish:${input.id}`),
			);
			if (!result.success) {
				return throwListingRouterError(result.error);
			}

			const { listing: row } = result.output;
			return formatListing(row);
		} catch (error) {
			return throwListingRouterError(error);
		}
	}),
};
