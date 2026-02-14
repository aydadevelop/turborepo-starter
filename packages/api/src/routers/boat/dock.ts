import { db } from "@full-stack-cf-app/db";
import { boatDock } from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import { organizationPermissionProcedure } from "../../index";
import { insertAndReturn } from "../../lib/db-helpers";
import { requireManagedDock } from "./access";
import {
	boatDockOutputSchema,
	isValidBoatSlug,
	listBoatDocksInputSchema,
	normalizeBoatSlug,
	upsertBoatDockInputSchema,
} from "./schemas";

export const boatDockRouter = {
	list: organizationPermissionProcedure({
		boat: ["read"],
	})
		.route({
			summary: "List managed docks",
		})
		.input(listBoatDocksInputSchema)
		.output(z.array(boatDockOutputSchema))
		.handler(async ({ context, input }) => {
			const { organizationId } = context.activeMembership;
			const where = and(
				eq(boatDock.organizationId, organizationId),
				input.search
					? sql`(lower(${boatDock.name}) like ${`%${input.search.toLowerCase()}%`} or lower(${boatDock.slug}) like ${`%${input.search.toLowerCase()}%`})`
					: undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(boatDock)
				.where(where)
				.orderBy(desc(boatDock.createdAt))
				.limit(input.limit);
		}),

	upsert: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Create or update a dock",
		})
		.input(upsertBoatDockInputSchema)
		.output(boatDockOutputSchema)
		.handler(async ({ context, input }) => {
			const { organizationId } = context.activeMembership;
			const normalizedSlug = normalizeBoatSlug(input.slug ?? input.name);
			if (!isValidBoatSlug(normalizedSlug)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid dock slug",
				});
			}

			const dockId = input.id ?? crypto.randomUUID();

			if (input.id) {
				await requireManagedDock(input.id, organizationId);

				await db
					.update(boatDock)
					.set({
						name: input.name,
						slug: normalizedSlug,
						description: input.description,
						address: input.address,
						latitude: input.latitude,
						longitude: input.longitude,
						isActive: input.isActive,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(boatDock.id, dockId),
							eq(boatDock.organizationId, organizationId)
						)
					);

				const [savedDock] = await db
					.select()
					.from(boatDock)
					.where(eq(boatDock.id, dockId))
					.limit(1);

				if (!savedDock) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}

				return savedDock;
			}

			return await insertAndReturn(boatDock, {
				id: dockId,
				organizationId,
				name: input.name,
				slug: normalizedSlug,
				description: input.description,
				address: input.address,
				latitude: input.latitude,
				longitude: input.longitude,
				isActive: input.isActive,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}),
};
