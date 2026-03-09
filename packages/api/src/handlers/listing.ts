import { db } from "@my-app/db";
import {
	createListing,
	getListing,
	listListings,
	publishListing,
	unpublishListing,
	updateListing,
	type ListingRow,
} from "@my-app/catalog";

import { organizationPermissionProcedure } from "../index";

const formatListing = (row: ListingRow) => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const listingRouter = {
	create: organizationPermissionProcedure({
		listing: ["create"],
	}).listing.create.handler(async ({ context, input }) => {
		const row = await createListing(
			{
				...input,
				organizationId: context.activeMembership.organizationId,
			},
			db,
		);
		return formatListing(row);
	}),

	update: organizationPermissionProcedure({
		listing: ["update"],
	}).listing.update.handler(async ({ context, input }) => {
		const row = await updateListing(
			{
				...input,
				organizationId: context.activeMembership.organizationId,
			},
			db,
		);
		return formatListing(row);
	}),

	get: organizationPermissionProcedure({
		listing: ["read"],
	}).listing.get.handler(async ({ context, input }) => {
		const row = await getListing(
			input.id,
			context.activeMembership.organizationId,
			db,
		);
		return formatListing(row);
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
			db,
		);
		return { items: items.map(formatListing), total: items.length };
	}),

	publish: organizationPermissionProcedure({
		listing: ["update"],
	}).listing.publish.handler(async ({ context, input }) => {
		const { listing: row } = await publishListing(
			{
				listingId: input.id,
				organizationId: context.activeMembership.organizationId,
				channelType: input.channelType ?? undefined,
			},
			db,
		);
		return formatListing(row);
	}),

	unpublish: organizationPermissionProcedure({
		listing: ["update"],
	}).listing.unpublish.handler(async ({ context, input }) => {
		const row = await unpublishListing(
			input.id,
			context.activeMembership.organizationId,
			db,
		);
		return formatListing(row);
	}),
};
