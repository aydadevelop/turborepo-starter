import { db } from "@full-stack-cf-app/db";
import {
	boat,
	boatAmenity,
	boatAsset,
	boatAvailabilityBlock,
	boatAvailabilityRule,
	boatCalendarConnection,
	boatMinimumDurationRule,
	boatPricingProfile,
	boatPricingRule,
} from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import z from "zod";

import { organizationPermissionProcedure } from "../../index";
import { buildUpdatePayload, insertAndReturn } from "../../lib/db-helpers";
import {
	archiveManagedBoatInputSchema,
	boatOutputSchema,
	createManagedBoatInputSchema,
	getManagedBoatInputSchema,
	getManagedBoatOutputSchema,
	isValidBoatSlug,
	listManagedBoatsInputSchema,
	normalizeBoatSlug,
	updateManagedBoatInputSchema,
} from "./schemas";
import { requireManagedBoat, requireManagedDock } from "./access";
import { successOutputSchema } from "../shared/schema-utils";

export const boatSelfRouter = {
	listManaged: organizationPermissionProcedure({
		boat: ["read"],
	})
		.route({
			summary: "List managed boats",
			description:
				"List boats belonging to the active organization with optional filters.",
		})
		.input(listManagedBoatsInputSchema)
		.output(z.array(boatOutputSchema))
		.handler(async ({ context, input }) => {
			const { organizationId } = context.activeMembership;

			const where = and(
				eq(boat.organizationId, organizationId),
				input.status ? eq(boat.status, input.status) : undefined,
				input.dockId ? eq(boat.dockId, input.dockId) : undefined,
				input.includeArchived ? undefined : isNull(boat.archivedAt),
				input.search
					? sql`(lower(${boat.name}) like ${`%${input.search.toLowerCase()}%`} or lower(${boat.slug}) like ${`%${input.search.toLowerCase()}%`})`
					: undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(boat)
				.where(where)
				.orderBy(desc(boat.createdAt))
				.limit(input.limit);
		}),

	getManaged: organizationPermissionProcedure({
		boat: ["read"],
	})
		.route({
			summary: "Get managed boat details",
			description:
				"Get a boat with optional related data: amenities, assets, calendar connections, availability, and pricing.",
		})
		.input(getManagedBoatInputSchema)
		.output(getManagedBoatOutputSchema)
		.handler(async ({ context, input }) => {
			const { organizationId } = context.activeMembership;
			const managedBoat = await requireManagedBoat(input.boatId, organizationId);

			const [
				amenities,
				assets,
				calendarConnections,
				availabilityRules,
				availabilityBlocks,
				pricingProfiles,
				pricingRules,
				minimumDurationRules,
			] = await Promise.all([
				input.withAmenities
					? db
							.select()
							.from(boatAmenity)
							.where(eq(boatAmenity.boatId, managedBoat.id))
					: Promise.resolve(undefined),
				input.withAssets
					? db
							.select()
							.from(boatAsset)
							.where(eq(boatAsset.boatId, managedBoat.id))
							.orderBy(boatAsset.sortOrder)
					: Promise.resolve(undefined),
				input.withCalendarConnections
					? db
							.select()
							.from(boatCalendarConnection)
							.where(eq(boatCalendarConnection.boatId, managedBoat.id))
					: Promise.resolve(undefined),
				input.withAvailability
					? db
							.select()
							.from(boatAvailabilityRule)
							.where(eq(boatAvailabilityRule.boatId, managedBoat.id))
					: Promise.resolve(undefined),
				input.withAvailability
					? db
							.select()
							.from(boatAvailabilityBlock)
							.where(eq(boatAvailabilityBlock.boatId, managedBoat.id))
							.orderBy(desc(boatAvailabilityBlock.startsAt))
					: Promise.resolve(undefined),
				input.withPricing
					? db
							.select()
							.from(boatPricingProfile)
							.where(eq(boatPricingProfile.boatId, managedBoat.id))
							.orderBy(desc(boatPricingProfile.validFrom))
					: Promise.resolve(undefined),
				input.withPricing
					? db
							.select()
							.from(boatPricingRule)
							.where(eq(boatPricingRule.boatId, managedBoat.id))
							.orderBy(desc(boatPricingRule.priority))
					: Promise.resolve(undefined),
				input.withMinimumDurationRules
					? db
							.select()
							.from(boatMinimumDurationRule)
							.where(eq(boatMinimumDurationRule.boatId, managedBoat.id))
					: Promise.resolve(undefined),
			]);

			return {
				boat: managedBoat,
				amenities,
				assets,
				calendarConnections,
				availabilityRules,
				availabilityBlocks,
				pricingProfiles,
				pricingRules,
				minimumDurationRules,
			};
		}),

	createManaged: organizationPermissionProcedure({
		boat: ["create"],
	})
		.route({
			summary: "Create a managed boat",
		})
		.input(createManagedBoatInputSchema)
		.output(boatOutputSchema)
		.handler(async ({ context, input }) => {
			const { organizationId } = context.activeMembership;
			if (input.dockId) {
				await requireManagedDock(input.dockId, organizationId);
			}

			const normalizedSlug = normalizeBoatSlug(input.slug ?? input.name);
			if (!isValidBoatSlug(normalizedSlug)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid boat slug",
				});
			}

			return await insertAndReturn(boat, {
				id: crypto.randomUUID(),
				organizationId,
				dockId: input.dockId,
				name: input.name,
				slug: normalizedSlug,
				description: input.description,
				type: input.type,
				passengerCapacity: input.passengerCapacity,
				crewCapacity: input.crewCapacity,
				minimumHours: input.minimumHours,
				minimumNoticeMinutes: input.minimumNoticeMinutes,
				allowShiftRequests: input.allowShiftRequests,
				workingHoursStart: input.workingHoursStart,
				workingHoursEnd: input.workingHoursEnd,
				timezone: input.timezone,
				status: input.status,
				isActive: true,
				metadata: input.metadata,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}),

	updateManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Update a managed boat",
		})
		.input(updateManagedBoatInputSchema)
		.output(boatOutputSchema)
		.handler(async ({ context, input }) => {
			const { organizationId } = context.activeMembership;
			await requireManagedBoat(input.boatId, organizationId);

			if (input.dockId) {
				await requireManagedDock(input.dockId, organizationId);
			}

			const normalizedSlug = input.slug
				? normalizeBoatSlug(input.slug)
				: undefined;
			if (normalizedSlug && !isValidBoatSlug(normalizedSlug)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid boat slug",
				});
			}

			const updateFields = buildUpdatePayload({
				name: input.name,
				slug: normalizedSlug,
				description: input.description,
				type: input.type,
				passengerCapacity: input.passengerCapacity,
				crewCapacity: input.crewCapacity,
				minimumHours: input.minimumHours,
				minimumNoticeMinutes: input.minimumNoticeMinutes,
				allowShiftRequests: input.allowShiftRequests,
				workingHoursStart: input.workingHoursStart,
				workingHoursEnd: input.workingHoursEnd,
				timezone: input.timezone,
				status: input.status,
				dockId: input.dockId === null ? null : input.dockId,
				isActive: input.isActive,
				metadata: input.metadata,
			});

			if (Object.keys(updateFields).length <= 1) {
				throw new ORPCError("BAD_REQUEST", {
					message: "No fields provided for update",
				});
			}

			await db
				.update(boat)
				.set(updateFields)
				.where(
					and(eq(boat.id, input.boatId), eq(boat.organizationId, organizationId))
				);

			const [updatedBoat] = await db
				.select()
				.from(boat)
				.where(eq(boat.id, input.boatId))
				.limit(1);

			if (!updatedBoat) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return updatedBoat;
		}),

	archiveManaged: organizationPermissionProcedure({
		boat: ["delete"],
	})
		.route({
			summary: "Archive a managed boat",
			description:
				"Soft-deletes a boat by setting it to inactive and recording archive timestamp.",
		})
		.input(archiveManagedBoatInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const { organizationId } = context.activeMembership;
			await requireManagedBoat(input.boatId, organizationId);

			await db
				.update(boat)
				.set({
					status: "inactive",
					isActive: false,
					archivedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(eq(boat.id, input.boatId), eq(boat.organizationId, organizationId))
				);

			return { success: true };
		}),
};
