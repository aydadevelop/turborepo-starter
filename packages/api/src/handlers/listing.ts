import {
	createListing,
	getListing,
	isCatalogErrorCode,
	type ListingRow,
	listAvailableListingTypes,
	listListings,
	publishListing,
	unpublishListing,
	updateListing,
} from "@my-app/catalog";
import { db } from "@my-app/db";
import { ORPCError } from "@orpc/server";
import { organizationPermissionProcedure } from "../index";
import { recalculateOrganizationOnboarding } from "../services/organization-onboarding";

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
				db
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
				db
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
				db
			);
			return formatListing(row);
		} catch (error) {
			return throwListingRouterError(error);
		}
	}),

	list: organizationPermissionProcedure({
		listing: ["read"],
	}).listing.list.handler(async ({ context, input }) => {
		const items = await listListings(
			{
				organizationId: context.activeMembership.organizationId,
				limit: input.limit,
				offset: input.offset,
			},
			db
		);
		return { items: items.map(formatListing), total: items.length };
	}),

	listAvailableTypes: organizationPermissionProcedure({
		listing: ["read"],
	}).listing.listAvailableTypes.handler(async ({ context }) => {
		return listAvailableListingTypes(
			context.activeMembership.organizationId,
			db
		);
	}),

	publish: organizationPermissionProcedure({
		listing: ["update"],
	}).listing.publish.handler(async ({ context, input }) => {
		try {
			const { listing: row } = await publishListing(
				{
					listingId: input.id,
					organizationId: context.activeMembership.organizationId,
					channelType: input.channelType ?? undefined,
				},
				db
			);
			await recalculateOrganizationOnboarding(
				context.activeMembership.organizationId,
				db
			);
			return formatListing(row);
		} catch (error) {
			return throwListingRouterError(error);
		}
	}),

	unpublish: organizationPermissionProcedure({
		listing: ["update"],
	}).listing.unpublish.handler(async ({ context, input }) => {
		try {
			const row = await unpublishListing(
				input.id,
				context.activeMembership.organizationId,
				db
			);
			await recalculateOrganizationOnboarding(
				context.activeMembership.organizationId,
				db
			);
			return formatListing(row);
		} catch (error) {
			return throwListingRouterError(error);
		}
	}),
};
