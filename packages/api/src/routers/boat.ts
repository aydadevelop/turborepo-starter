import { db } from "@full-stack-cf-app/db";
import {
	boat,
	boatAmenity,
	boatAsset,
	boatAvailabilityBlock,
	boatAvailabilityRule,
	boatCalendarConnection,
	boatDock,
	boatPricingProfile,
	boatPricingRule,
} from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";

import { organizationPermissionProcedure } from "../index";
import {
	archiveManagedBoatInputSchema,
	boatIdInputSchema,
	createBoatAssetInputSchema,
	createBoatAvailabilityBlockInputSchema,
	createBoatPricingProfileInputSchema,
	createBoatPricingRuleInputSchema,
	createManagedBoatInputSchema,
	deleteBoatAvailabilityBlockInputSchema,
	deleteBoatPricingRuleInputSchema,
	getManagedBoatInputSchema,
	isValidBoatSlug,
	listBoatAssetsInputSchema,
	listBoatAvailabilityBlocksInputSchema,
	listBoatAvailabilityRulesInputSchema,
	listBoatCalendarConnectionsInputSchema,
	listBoatDocksInputSchema,
	listBoatPricingProfilesInputSchema,
	listBoatPricingRulesInputSchema,
	listManagedBoatsInputSchema,
	normalizeBoatSlug,
	replaceBoatAmenitiesInputSchema,
	replaceBoatAvailabilityRulesInputSchema,
	setDefaultBoatPricingProfileInputSchema,
	updateManagedBoatInputSchema,
	upsertBoatCalendarConnectionInputSchema,
	upsertBoatDockInputSchema,
} from "./boat.schemas";

const buildWhere = (conditions: Array<SQL | undefined>) => {
	const filtered = conditions.filter(
		(condition): condition is SQL => !!condition
	);
	if (filtered.length === 0) {
		return undefined;
	}
	if (filtered.length === 1) {
		return filtered[0];
	}
	return and(...filtered);
};

const requireActiveMembership = (context: {
	activeMembership: { organizationId: string; role: string } | null;
}) => {
	if (!context.activeMembership) {
		throw new ORPCError("FORBIDDEN");
	}
	return context.activeMembership;
};

const requireSessionUserId = (context: {
	session: {
		user: {
			id: string;
		};
	} | null;
}) => {
	const userId = context.session?.user.id;
	if (!userId) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return userId;
};

const requireManagedBoat = async (boatId: string, organizationId: string) => {
	const [managedBoat] = await db
		.select()
		.from(boat)
		.where(and(eq(boat.id, boatId), eq(boat.organizationId, organizationId)))
		.limit(1);

	if (!managedBoat) {
		throw new ORPCError("NOT_FOUND");
	}

	return managedBoat;
};

const requireManagedDock = async (dockId: string, organizationId: string) => {
	const [managedDock] = await db
		.select()
		.from(boatDock)
		.where(
			and(eq(boatDock.id, dockId), eq(boatDock.organizationId, organizationId))
		)
		.limit(1);

	if (!managedDock) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Dock does not belong to the active organization",
		});
	}

	return managedDock;
};

const requireCalendarConnectionForBoat = async (
	calendarConnectionId: string,
	boatId: string
) => {
	const [connection] = await db
		.select()
		.from(boatCalendarConnection)
		.where(
			and(
				eq(boatCalendarConnection.id, calendarConnectionId),
				eq(boatCalendarConnection.boatId, boatId)
			)
		)
		.limit(1);

	if (!connection) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Calendar connection does not belong to this boat",
		});
	}

	return connection;
};

export const boatRouter = {
	listManaged: organizationPermissionProcedure({
		boat: ["read"],
	})
		.input(listManagedBoatsInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);

			const where = buildWhere([
				eq(boat.organizationId, activeMembership.organizationId),
				input.status ? eq(boat.status, input.status) : undefined,
				input.dockId ? eq(boat.dockId, input.dockId) : undefined,
				input.includeArchived ? undefined : isNull(boat.archivedAt),
				input.search
					? sql`(lower(${boat.name}) like ${`%${input.search.toLowerCase()}%`} or lower(${boat.slug}) like ${`%${input.search.toLowerCase()}%`})`
					: undefined,
			]);

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
		.input(getManagedBoatInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const managedBoat = await requireManagedBoat(
				input.boatId,
				activeMembership.organizationId
			);

			const [
				amenities,
				assets,
				calendarConnections,
				availabilityRules,
				availabilityBlocks,
				pricingProfiles,
				pricingRules,
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
			};
		}),

	createManaged: organizationPermissionProcedure({
		boat: ["create"],
	})
		.input(createManagedBoatInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			if (input.dockId) {
				await requireManagedDock(input.dockId, activeMembership.organizationId);
			}

			const normalizedSlug = normalizeBoatSlug(input.slug ?? input.name);
			if (!isValidBoatSlug(normalizedSlug)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid boat slug",
				});
			}

			const boatId = crypto.randomUUID();
			await db.insert(boat).values({
				id: boatId,
				organizationId: activeMembership.organizationId,
				dockId: input.dockId,
				name: input.name,
				slug: normalizedSlug,
				description: input.description,
				type: input.type,
				passengerCapacity: input.passengerCapacity,
				crewCapacity: input.crewCapacity,
				minimumHours: input.minimumHours,
				minimumNoticeMinutes: input.minimumNoticeMinutes,
				workingHoursStart: input.workingHoursStart,
				workingHoursEnd: input.workingHoursEnd,
				timezone: input.timezone,
				status: input.status,
				isActive: true,
				metadata: input.metadata,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const [createdBoat] = await db
				.select()
				.from(boat)
				.where(eq(boat.id, boatId))
				.limit(1);

			if (!createdBoat) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return createdBoat;
		}),

	updateManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(updateManagedBoatInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			if (input.dockId) {
				await requireManagedDock(input.dockId, activeMembership.organizationId);
			}

			const normalizedSlug = input.slug
				? normalizeBoatSlug(input.slug)
				: undefined;
			if (normalizedSlug && !isValidBoatSlug(normalizedSlug)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid boat slug",
				});
			}

			const updatePayload = {
				name: input.name,
				slug: normalizedSlug,
				description: input.description,
				type: input.type,
				passengerCapacity: input.passengerCapacity,
				crewCapacity: input.crewCapacity,
				minimumHours: input.minimumHours,
				minimumNoticeMinutes: input.minimumNoticeMinutes,
				workingHoursStart: input.workingHoursStart,
				workingHoursEnd: input.workingHoursEnd,
				timezone: input.timezone,
				status: input.status,
				dockId: input.dockId === null ? null : input.dockId,
				isActive: input.isActive,
				metadata: input.metadata,
				updatedAt: new Date(),
			};

			const sanitizedUpdatePayload = Object.fromEntries(
				Object.entries(updatePayload).filter(([, value]) => value !== undefined)
			);

			if (Object.keys(sanitizedUpdatePayload).length === 0) {
				throw new ORPCError("BAD_REQUEST", {
					message: "No fields provided for update",
				});
			}

			await db
				.update(boat)
				.set(sanitizedUpdatePayload)
				.where(
					and(
						eq(boat.id, input.boatId),
						eq(boat.organizationId, activeMembership.organizationId)
					)
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
		.input(archiveManagedBoatInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			await db
				.update(boat)
				.set({
					status: "inactive",
					isActive: false,
					archivedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(boat.id, input.boatId),
						eq(boat.organizationId, activeMembership.organizationId)
					)
				);

			return { success: true };
		}),

	dockListManaged: organizationPermissionProcedure({
		boat: ["read"],
	})
		.input(listBoatDocksInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const where = buildWhere([
				eq(boatDock.organizationId, activeMembership.organizationId),
				input.search
					? sql`(lower(${boatDock.name}) like ${`%${input.search.toLowerCase()}%`} or lower(${boatDock.slug}) like ${`%${input.search.toLowerCase()}%`})`
					: undefined,
			]);

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

	dockUpsertManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(upsertBoatDockInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const normalizedSlug = normalizeBoatSlug(input.slug ?? input.name);
			if (!isValidBoatSlug(normalizedSlug)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid dock slug",
				});
			}

			const dockId = input.id ?? crypto.randomUUID();

			if (input.id) {
				await requireManagedDock(input.id, activeMembership.organizationId);

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
							eq(boatDock.organizationId, activeMembership.organizationId)
						)
					);
			} else {
				await db.insert(boatDock).values({
					id: dockId,
					organizationId: activeMembership.organizationId,
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
			}

			const [savedDock] = await db
				.select()
				.from(boatDock)
				.where(eq(boatDock.id, dockId))
				.limit(1);

			if (!savedDock) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return savedDock;
		}),

	amenityListManaged: organizationPermissionProcedure({
		boat: ["read"],
	})
		.input(boatIdInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);
			return await db
				.select()
				.from(boatAmenity)
				.where(eq(boatAmenity.boatId, input.boatId));
		}),

	amenityReplaceManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(replaceBoatAmenitiesInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			const keySet = new Set<string>();
			for (const amenity of input.amenities) {
				if (keySet.has(amenity.key)) {
					throw new ORPCError("BAD_REQUEST", {
						message: `Duplicate amenity key: ${amenity.key}`,
					});
				}
				keySet.add(amenity.key);
			}

			await db.delete(boatAmenity).where(eq(boatAmenity.boatId, input.boatId));

			if (input.amenities.length > 0) {
				await db.insert(boatAmenity).values(
					input.amenities.map((amenity) => ({
						id: crypto.randomUUID(),
						boatId: input.boatId,
						key: amenity.key,
						label: amenity.label,
						isEnabled: amenity.isEnabled,
						value: amenity.value,
						createdAt: new Date(),
						updatedAt: new Date(),
					}))
				);
			}

			return await db
				.select()
				.from(boatAmenity)
				.where(eq(boatAmenity.boatId, input.boatId));
		}),

	assetListManaged: organizationPermissionProcedure({
		boat: ["read"],
	})
		.input(listBoatAssetsInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			const where = buildWhere([
				eq(boatAsset.boatId, input.boatId),
				input.assetType ? eq(boatAsset.assetType, input.assetType) : undefined,
				input.purpose ? eq(boatAsset.purpose, input.purpose) : undefined,
			]);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(boatAsset)
				.where(where)
				.orderBy(boatAsset.sortOrder);
		}),

	assetCreateManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(createBoatAssetInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

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

			const assetId = crypto.randomUUID();
			await db.insert(boatAsset).values({
				id: assetId,
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

			const [createdAsset] = await db
				.select()
				.from(boatAsset)
				.where(eq(boatAsset.id, assetId))
				.limit(1);

			if (!createdAsset) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return createdAsset;
		}),

	calendarListManaged: organizationPermissionProcedure({
		boat: ["read"],
	})
		.input(listBoatCalendarConnectionsInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);
			return await db
				.select()
				.from(boatCalendarConnection)
				.where(eq(boatCalendarConnection.boatId, input.boatId));
		}),

	calendarUpsertManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(upsertBoatCalendarConnectionInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			const connectionId = input.id ?? crypto.randomUUID();

			if (input.isPrimary) {
				await db
					.update(boatCalendarConnection)
					.set({
						isPrimary: false,
						updatedAt: new Date(),
					})
					.where(eq(boatCalendarConnection.boatId, input.boatId));
			}

			if (input.id) {
				await requireCalendarConnectionForBoat(input.id, input.boatId);

				await db
					.update(boatCalendarConnection)
					.set({
						provider: input.provider,
						externalCalendarId: input.externalCalendarId,
						syncToken: input.syncToken,
						watchChannelId: input.watchChannelId,
						watchResourceId: input.watchResourceId,
						watchExpiresAt: input.watchExpiresAt,
						lastSyncedAt: input.lastSyncedAt,
						syncStatus: input.syncStatus,
						lastError: input.lastError,
						isPrimary: input.isPrimary,
						updatedAt: new Date(),
					})
					.where(eq(boatCalendarConnection.id, connectionId));
			} else {
				await db.insert(boatCalendarConnection).values({
					id: connectionId,
					boatId: input.boatId,
					provider: input.provider,
					externalCalendarId: input.externalCalendarId,
					syncToken: input.syncToken,
					watchChannelId: input.watchChannelId,
					watchResourceId: input.watchResourceId,
					watchExpiresAt: input.watchExpiresAt,
					lastSyncedAt: input.lastSyncedAt,
					syncStatus: input.syncStatus ?? "idle",
					lastError: input.lastError,
					isPrimary: input.isPrimary,
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			}

			const [savedConnection] = await db
				.select()
				.from(boatCalendarConnection)
				.where(eq(boatCalendarConnection.id, connectionId))
				.limit(1);

			if (!savedConnection) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return savedConnection;
		}),

	availabilityRuleListManaged: organizationPermissionProcedure({
		boat: ["read"],
	})
		.input(listBoatAvailabilityRulesInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);
			return await db
				.select()
				.from(boatAvailabilityRule)
				.where(eq(boatAvailabilityRule.boatId, input.boatId));
		}),

	availabilityRuleReplaceManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(replaceBoatAvailabilityRulesInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			await db
				.delete(boatAvailabilityRule)
				.where(eq(boatAvailabilityRule.boatId, input.boatId));

			if (input.rules.length > 0) {
				await db.insert(boatAvailabilityRule).values(
					input.rules.map((rule) => ({
						id: crypto.randomUUID(),
						boatId: input.boatId,
						dayOfWeek: rule.dayOfWeek,
						startMinute: rule.startMinute,
						endMinute: rule.endMinute,
						isActive: rule.isActive,
						createdAt: new Date(),
						updatedAt: new Date(),
					}))
				);
			}

			return await db
				.select()
				.from(boatAvailabilityRule)
				.where(eq(boatAvailabilityRule.boatId, input.boatId));
		}),

	availabilityBlockListManaged: organizationPermissionProcedure({
		boat: ["read"],
	})
		.input(listBoatAvailabilityBlocksInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			const where = buildWhere([
				eq(boatAvailabilityBlock.boatId, input.boatId),
				input.source
					? eq(boatAvailabilityBlock.source, input.source)
					: undefined,
				input.from
					? sql`${boatAvailabilityBlock.endsAt} > ${input.from}`
					: undefined,
				input.to
					? sql`${boatAvailabilityBlock.startsAt} < ${input.to}`
					: undefined,
			]);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(boatAvailabilityBlock)
				.where(where)
				.orderBy(desc(boatAvailabilityBlock.startsAt));
		}),

	availabilityBlockCreateManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(createBoatAvailabilityBlockInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			if (input.calendarConnectionId) {
				await requireCalendarConnectionForBoat(
					input.calendarConnectionId,
					input.boatId
				);
			}

			const blockId = crypto.randomUUID();
			await db.insert(boatAvailabilityBlock).values({
				id: blockId,
				boatId: input.boatId,
				calendarConnectionId: input.calendarConnectionId,
				source: input.source,
				externalRef: input.externalRef,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
				reason: input.reason,
				createdByUserId: sessionUserId,
				isActive: input.isActive,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const [createdBlock] = await db
				.select()
				.from(boatAvailabilityBlock)
				.where(eq(boatAvailabilityBlock.id, blockId))
				.limit(1);

			if (!createdBlock) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return createdBlock;
		}),

	availabilityBlockDeleteManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(deleteBoatAvailabilityBlockInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			const [existingBlock] = await db
				.select()
				.from(boatAvailabilityBlock)
				.where(
					and(
						eq(boatAvailabilityBlock.id, input.blockId),
						eq(boatAvailabilityBlock.boatId, input.boatId)
					)
				)
				.limit(1);

			if (!existingBlock) {
				throw new ORPCError("NOT_FOUND");
			}

			await db
				.delete(boatAvailabilityBlock)
				.where(
					and(
						eq(boatAvailabilityBlock.id, input.blockId),
						eq(boatAvailabilityBlock.boatId, input.boatId)
					)
				);

			return { success: true };
		}),

	pricingProfileListManaged: organizationPermissionProcedure({
		boat: ["read"],
	})
		.input(listBoatPricingProfilesInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			const where = buildWhere([
				eq(boatPricingProfile.boatId, input.boatId),
				input.includeArchived
					? undefined
					: isNull(boatPricingProfile.archivedAt),
			]);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(boatPricingProfile)
				.where(where)
				.orderBy(desc(boatPricingProfile.validFrom));
		}),

	pricingProfileCreateManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(createBoatPricingProfileInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			if (
				input.validFrom &&
				input.validTo &&
				input.validFrom >= input.validTo
			) {
				throw new ORPCError("BAD_REQUEST", {
					message: "validTo must be after validFrom",
				});
			}

			if (input.isDefault) {
				await db
					.update(boatPricingProfile)
					.set({
						isDefault: false,
						updatedAt: new Date(),
					})
					.where(eq(boatPricingProfile.boatId, input.boatId));
			}

			const pricingProfileId = crypto.randomUUID();
			await db.insert(boatPricingProfile).values({
				id: pricingProfileId,
				boatId: input.boatId,
				name: input.name,
				currency: input.currency.toUpperCase(),
				baseHourlyPriceCents: input.baseHourlyPriceCents,
				minimumHours: input.minimumHours,
				depositPercentage: input.depositPercentage,
				serviceFeePercentage: input.serviceFeePercentage,
				affiliateFeePercentage: input.affiliateFeePercentage,
				taxPercentage: input.taxPercentage,
				acquiringFeePercentage: input.acquiringFeePercentage,
				validFrom: input.validFrom ?? new Date(),
				validTo: input.validTo,
				isDefault: input.isDefault,
				createdByUserId: sessionUserId,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const [createdProfile] = await db
				.select()
				.from(boatPricingProfile)
				.where(eq(boatPricingProfile.id, pricingProfileId))
				.limit(1);

			if (!createdProfile) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return createdProfile;
		}),

	pricingProfileSetDefaultManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(setDefaultBoatPricingProfileInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			const [profile] = await db
				.select()
				.from(boatPricingProfile)
				.where(
					and(
						eq(boatPricingProfile.id, input.pricingProfileId),
						eq(boatPricingProfile.boatId, input.boatId)
					)
				)
				.limit(1);

			if (!profile) {
				throw new ORPCError("NOT_FOUND");
			}

			await db
				.update(boatPricingProfile)
				.set({
					isDefault: false,
					updatedAt: new Date(),
				})
				.where(eq(boatPricingProfile.boatId, input.boatId));

			await db
				.update(boatPricingProfile)
				.set({
					isDefault: true,
					updatedAt: new Date(),
				})
				.where(eq(boatPricingProfile.id, input.pricingProfileId));

			return { success: true };
		}),

	pricingRuleListManaged: organizationPermissionProcedure({
		boat: ["read"],
	})
		.input(listBoatPricingRulesInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			const where = buildWhere([
				eq(boatPricingRule.boatId, input.boatId),
				input.pricingProfileId
					? eq(boatPricingRule.pricingProfileId, input.pricingProfileId)
					: undefined,
			]);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(boatPricingRule)
				.where(where)
				.orderBy(desc(boatPricingRule.priority));
		}),

	pricingRuleCreateManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(createBoatPricingRuleInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			if (input.pricingProfileId) {
				const [pricingProfile] = await db
					.select()
					.from(boatPricingProfile)
					.where(
						and(
							eq(boatPricingProfile.id, input.pricingProfileId),
							eq(boatPricingProfile.boatId, input.boatId)
						)
					)
					.limit(1);

				if (!pricingProfile) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Pricing profile does not belong to this boat",
					});
				}
			}

			try {
				JSON.parse(input.conditionJson);
			} catch {
				throw new ORPCError("BAD_REQUEST", {
					message: "conditionJson must be valid JSON",
				});
			}

			const pricingRuleId = crypto.randomUUID();
			await db.insert(boatPricingRule).values({
				id: pricingRuleId,
				boatId: input.boatId,
				pricingProfileId: input.pricingProfileId,
				name: input.name,
				ruleType: input.ruleType,
				conditionJson: input.conditionJson,
				adjustmentType: input.adjustmentType,
				adjustmentValue: input.adjustmentValue,
				priority: input.priority,
				isActive: input.isActive,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const [createdRule] = await db
				.select()
				.from(boatPricingRule)
				.where(eq(boatPricingRule.id, pricingRuleId))
				.limit(1);

			if (!createdRule) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return createdRule;
		}),

	pricingRuleDeleteManaged: organizationPermissionProcedure({
		boat: ["update"],
	})
		.input(deleteBoatPricingRuleInputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedBoat(input.boatId, activeMembership.organizationId);

			const [existingRule] = await db
				.select()
				.from(boatPricingRule)
				.where(
					and(
						eq(boatPricingRule.id, input.ruleId),
						eq(boatPricingRule.boatId, input.boatId)
					)
				)
				.limit(1);

			if (!existingRule) {
				throw new ORPCError("NOT_FOUND");
			}

			await db
				.delete(boatPricingRule)
				.where(
					and(
						eq(boatPricingRule.id, input.ruleId),
						eq(boatPricingRule.boatId, input.boatId)
					)
				);

			return { success: true };
		}),
};
