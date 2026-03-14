import { getPublicBookingSurface } from "@my-app/booking";
import { getPublishedListing, searchPublishedListings } from "@my-app/catalog";
import { db } from "@my-app/db";
import { ORPCError } from "@orpc/server";

import { publicProcedure } from "../index";

export const storefrontRouter = {
	list: publicProcedure.storefront.list.handler(({ input }) => {
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

	getBookingSurface: publicProcedure.storefront.getBookingSurface.handler(
		async ({ context, input }) => {
			try {
				return await getPublicBookingSurface(input, db, {
					customerUserId: context.session?.user?.id,
				});
			} catch (e) {
				if (e instanceof Error) {
					if (e.message === "NOT_FOUND") {
						throw new ORPCError("NOT_FOUND");
					}
					if (e.message === "NOT_SUPPORTED") {
						throw new ORPCError("PRECONDITION_FAILED", {
							message:
								"Public booking surface is not supported for this listing",
						});
					}
				}
				throw e;
			}
		},
	),
};
