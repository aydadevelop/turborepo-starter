import { db } from "@full-stack-cf-app/db";
import { boatAsset } from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import z from "zod";

import { organizationPermissionProcedure } from "../../index";
import { insertAndReturn } from "../../lib/db-helpers";
import { requireSessionUserId } from "../shared/auth-utils";
import { requireManagedBoat } from "./access";
import {
	boatAssetOutputSchema,
	createBoatAssetInputSchema,
	listBoatAssetsInputSchema,
} from "./schemas";

export const boatAssetRouter = {
	list: organizationPermissionProcedure({
		boat: ["read"],
	})
		.route({
			summary: "List boat assets",
		})
		.input(listBoatAssetsInputSchema)
		.output(z.array(boatAssetOutputSchema))
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			const where = and(
				eq(boatAsset.boatId, input.boatId),
				input.assetType ? eq(boatAsset.assetType, input.assetType) : undefined,
				input.purpose ? eq(boatAsset.purpose, input.purpose) : undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(boatAsset)
				.where(where)
				.orderBy(boatAsset.sortOrder);
		}),

	create: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Create a boat asset",
		})
		.input(createBoatAssetInputSchema)
		.output(boatAssetOutputSchema)
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			if (input.isPrimary) {
				await db
					.update(boatAsset)
					.set({
						isPrimary: false,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(boatAsset.boatId, input.boatId),
							eq(boatAsset.assetType, input.assetType),
							eq(boatAsset.purpose, input.purpose)
						)
					);
			}

			return await insertAndReturn(boatAsset, {
				id: crypto.randomUUID(),
				boatId: input.boatId,
				assetType: input.assetType,
				purpose: input.purpose,
				storageKey: input.storageKey,
				fileName: input.fileName,
				mimeType: input.mimeType,
				sizeBytes: input.sizeBytes,
				uploadedByUserId: sessionUserId,
				sortOrder: input.sortOrder,
				isPrimary: input.isPrimary,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}),
};
