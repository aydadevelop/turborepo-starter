import { ORPCError } from "@orpc/server";
import { db } from "@my-app/db";
import {
	getPublishedListing,
	searchPublishedListings,
} from "@my-app/catalog";

import { publicProcedure } from "../index";

export const storefrontRouter = {
	list: publicProcedure.storefront.list.handler(async ({ input }) => {
		return searchPublishedListings(input, db);
	}),

	get: publicProcedure.storefront.get.handler(async ({ input }) => {
		try {
			return await getPublishedListing(input.id, db);
		} catch (e) {
			if (e instanceof Error && e.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw e;
		}
	}),
};
