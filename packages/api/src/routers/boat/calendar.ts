import { db } from "@full-stack-cf-app/db";
import { boatCalendarConnection } from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import {
	initialSyncCalendarConnection,
	resyncCalendarConnection,
} from "../../calendar/application/calendar-use-cases";
import {
	boatCalendarConnectionOutputSchema,
	boatIdInputSchema,
	listBoatCalendarConnectionsInputSchema,
	upsertBoatCalendarConnectionInputSchema,
} from "../../contracts/boat";
import { organizationPermissionProcedure } from "../../index";
import { insertAndReturn } from "../../lib/db-helpers";
import { requireCalendarConnectionForBoat, requireManagedBoat } from "./access";

export const boatCalendarRouter = {
	list: organizationPermissionProcedure({
		boat: ["read"],
	})
		.route({
			summary: "List boat calendar connections",
		})
		.input(listBoatCalendarConnectionsInputSchema)
		.output(z.array(boatCalendarConnectionOutputSchema))
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);
			return await db
				.select()
				.from(boatCalendarConnection)
				.where(eq(boatCalendarConnection.boatId, input.boatId));
		}),

	upsert: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Create or update a calendar connection",
		})
		.input(upsertBoatCalendarConnectionInputSchema)
		.output(boatCalendarConnectionOutputSchema)
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

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

				const [savedConnection] = await db
					.select()
					.from(boatCalendarConnection)
					.where(eq(boatCalendarConnection.id, connectionId))
					.limit(1);

				if (!savedConnection) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}

				return savedConnection;
			}

			return await insertAndReturn(boatCalendarConnection, {
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
			}).then((connection) => {
				initialSyncCalendarConnection({ connectionId: connection.id }).catch(
					(error) =>
						console.error(
							`Background initial sync failed for connection ${connection.id}`,
							error
						)
				);
				return connection;
			});
		}),

	resync: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Manually re-sync a calendar connection",
		})
		.input(
			boatIdInputSchema.extend({
				connectionId: z.string().trim().min(1),
			})
		)
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);
			await requireCalendarConnectionForBoat(input.connectionId, input.boatId);

			const outcome = await resyncCalendarConnection({
				connectionId: input.connectionId,
			});

			if (outcome.kind === "error") {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: outcome.message,
				});
			}

			return outcome;
		}),
};
