import { db } from "@full-stack-cf-app/db";
import { organization } from "@full-stack-cf-app/db/schema/auth";
import {
	boat,
	boatAsset,
	boatAssetReviewStatusValues,
	boatCalendarConnection,
	boatDock,
	calendarProviderValues,
} from "@full-stack-cf-app/db/schema/boat";
import { env } from "@full-stack-cf-app/env/server";
import { ORPCError } from "@orpc/server";
import {
	and,
	count,
	desc,
	eq,
	isNull,
	like,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import z from "zod";
import {
	initialSyncCalendarConnection,
	startGoogleWatch,
	stopGoogleWatch,
} from "../../calendar/application/calendar-use-cases";
import { boatCalendarConnectionOutputSchema } from "../../contracts/boat";
import {
	optionalTrimmedString,
	successOutputSchema,
} from "../../contracts/shared";
import { buildUpdatePayload, insertAndReturn } from "../../lib/db-helpers";
import { reconcileBoatCalendarConnectionsOnStateChange } from "../boat/services/calendar-lifecycle";
import { adminProcedure } from "../shared/admin";
import { paginatedOutput, paginationInput } from "./shared";

const boatOutputSchema = createSelectSchema(boat);
const boatAssetOutputSchema = createSelectSchema(boatAsset);
const dockOutputSchema = createSelectSchema(boatDock);

export const adminBoatsRouter = {
	// ── Boat CRUD ───────────────────────────────────────────

	list: adminProcedure
		.route({ summary: "List boats across all organizations" })
		.input(
			paginationInput.extend({
				organizationId: z.string().trim().optional(),
				status: z
					.enum(["draft", "active", "maintenance", "inactive"])
					.optional(),
				onlyPendingApproval: z.boolean().default(false),
				search: z.string().trim().optional(),
			})
		)
		.output(
			paginatedOutput(
				boatOutputSchema.extend({
					organizationName: z.string().optional(),
					calendarCount: z.number(),
					calendarSyncStatus: z
						.enum(["none", "idle", "syncing", "error", "disabled"])
						.nullable(),
					calendarLastSyncedAt: z.date().nullable(),
					webhookActiveCount: z.number(),
				})
			)
		)
		.handler(async ({ input }) => {
			const conditions: SQL[] = [];
			if (input.organizationId) {
				conditions.push(eq(boat.organizationId, input.organizationId));
			}
			if (input.status) {
				conditions.push(eq(boat.status, input.status));
			}
			if (input.onlyPendingApproval) {
				conditions.push(isNull(boat.approvedAt));
			}
			if (input.search) {
				const searchCondition = or(
					like(boat.name, `%${input.search}%`),
					like(boat.slug, `%${input.search}%`)
				);
				if (searchCondition) {
					conditions.push(searchCondition);
				}
			}
			const where = conditions.length > 0 ? and(...conditions) : undefined;

			const calendarCountSq = db
				.select({
					boatId: boatCalendarConnection.boatId,
					calendarCount: sql<number>`count(*)`.as("calendar_count"),
					hasError:
						sql<number>`sum(case when ${boatCalendarConnection.syncStatus} = 'error' then 1 else 0 end)`.as(
							"has_error"
						),
					hasSyncing:
						sql<number>`sum(case when ${boatCalendarConnection.syncStatus} = 'syncing' then 1 else 0 end)`.as(
							"has_syncing"
						),
					allDisabled:
						sql<number>`min(case when ${boatCalendarConnection.syncStatus} = 'disabled' then 1 else 0 end)`.as(
							"all_disabled"
						),
					lastSyncedAt: sql<
						number | null
					>`max(${boatCalendarConnection.lastSyncedAt})`.as("last_synced_at"),
					webhookActiveCount:
						sql<number>`sum(case when ${boatCalendarConnection.watchChannelId} is not null and ${boatCalendarConnection.watchExpiresAt} > ${Date.now()} then 1 else 0 end)`.as(
							"webhook_active_count"
						),
				})
				.from(boatCalendarConnection)
				.groupBy(boatCalendarConnection.boatId)
				.as("cal");

			const [rows, countRows] = await Promise.all([
				db
					.select({
						boat,
						organizationName: organization.name,
						calendarCount: calendarCountSq.calendarCount,
						hasError: calendarCountSq.hasError,
						hasSyncing: calendarCountSq.hasSyncing,
						allDisabled: calendarCountSq.allDisabled,
						calendarLastSyncedAt: calendarCountSq.lastSyncedAt,
						webhookActiveCount: calendarCountSq.webhookActiveCount,
					})
					.from(boat)
					.leftJoin(organization, eq(organization.id, boat.organizationId))
					.leftJoin(calendarCountSq, eq(calendarCountSq.boatId, boat.id))
					.where(where)
					.orderBy(desc(boat.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(boat).where(where),
			]);

			const deriveSyncStatus = (row: (typeof rows)[number]) => {
				const cnt = row.calendarCount ?? 0;
				if (cnt === 0) {
					return "none" as const;
				}
				if ((row.hasError ?? 0) > 0) {
					return "error" as const;
				}
				if ((row.hasSyncing ?? 0) > 0) {
					return "syncing" as const;
				}
				if ((row.allDisabled ?? 0) === 1) {
					return "disabled" as const;
				}
				return "idle" as const;
			};

			return {
				items: rows.map((r) => ({
					...r.boat,
					organizationName: r.organizationName ?? undefined,
					calendarCount: r.calendarCount ?? 0,
					calendarSyncStatus: deriveSyncStatus(r),
					calendarLastSyncedAt: r.calendarLastSyncedAt
						? new Date(r.calendarLastSyncedAt)
						: null,
					webhookActiveCount: r.webhookActiveCount ?? 0,
				})),
				total: countRows[0]?.value ?? 0,
			};
		}),

	get: adminProcedure
		.route({ summary: "Get a boat by ID" })
		.input(z.object({ id: z.string().trim().min(1) }))
		.output(
			boatOutputSchema.extend({
				organizationName: z.string().optional(),
				dockName: z.string().optional(),
			})
		)
		.handler(async ({ input }) => {
			const [row] = await db
				.select({
					boat,
					organizationName: organization.name,
					dockName: boatDock.name,
				})
				.from(boat)
				.leftJoin(organization, eq(organization.id, boat.organizationId))
				.leftJoin(boatDock, eq(boatDock.id, boat.dockId))
				.where(eq(boat.id, input.id))
				.limit(1);

			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "Boat not found" });
			}

			return {
				...row.boat,
				organizationName: row.organizationName ?? undefined,
				dockName: row.dockName ?? undefined,
			};
		}),

	update: adminProcedure
		.route({ summary: "Update a boat as admin" })
		.input(
			z.object({
				id: z.string().trim().min(1),
				status: z
					.enum(["draft", "active", "maintenance", "inactive"])
					.optional(),
				isActive: z.boolean().optional(),
				name: z.string().trim().min(1).optional(),
			})
		)
		.output(successOutputSchema)
		.handler(async ({ input }) => {
			const { id, ...fields } = input;
			const [existingBoat] = await db
				.select()
				.from(boat)
				.where(eq(boat.id, id))
				.limit(1);
			if (!existingBoat) {
				throw new ORPCError("NOT_FOUND", { message: "Boat not found" });
			}

			const nextStatus = input.status ?? existingBoat.status;
			const nextIsActive = input.isActive ?? existingBoat.isActive;
			const payload = buildUpdatePayload(fields);

			await db
				.update(boat)
				.set(payload)
				.where(eq(boat.id, id))
				.returning({ id: boat.id });

			try {
				await reconcileBoatCalendarConnectionsOnStateChange({
					boatId: existingBoat.id,
					previousStatus: existingBoat.status,
					previousIsActive: existingBoat.isActive,
					nextStatus,
					nextIsActive,
					webhookUrl: env.GOOGLE_CALENDAR_WEBHOOK_URL || undefined,
					webhookChannelToken:
						env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN || undefined,
				});
			} catch (error) {
				console.error(
					`Failed to reconcile calendar lifecycle for boat ${existingBoat.id} after admin update`,
					error
				);
			}

			return { success: true };
		}),

	// ── Approval (merged from boat-review) ──────────────────

	approveBoat: adminProcedure
		.route({ summary: "Approve a boat" })
		.input(z.object({ boatId: z.string().trim().min(1) }))
		.output(successOutputSchema)
		.handler(async ({ input }) => {
			const [existingBoat] = await db
				.select()
				.from(boat)
				.where(eq(boat.id, input.boatId))
				.limit(1);
			if (!existingBoat) {
				throw new ORPCError("NOT_FOUND", { message: "Boat not found" });
			}

			const [updated] = await db
				.update(boat)
				.set({
					approvedAt: new Date(),
					status: "active",
					updatedAt: new Date(),
				})
				.where(eq(boat.id, input.boatId))
				.returning({ id: boat.id });

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Boat not found" });
			}

			try {
				await reconcileBoatCalendarConnectionsOnStateChange({
					boatId: existingBoat.id,
					previousStatus: existingBoat.status,
					previousIsActive: existingBoat.isActive,
					nextStatus: "active",
					nextIsActive: existingBoat.isActive,
					webhookUrl: env.GOOGLE_CALENDAR_WEBHOOK_URL || undefined,
					webhookChannelToken:
						env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN || undefined,
				});
			} catch (error) {
				console.error(
					`Failed to reconcile calendar lifecycle for boat ${existingBoat.id} on approval`,
					error
				);
			}

			return { success: true };
		}),

	revokeApproval: adminProcedure
		.route({ summary: "Revoke boat approval" })
		.input(z.object({ boatId: z.string().trim().min(1) }))
		.output(successOutputSchema)
		.handler(async ({ input }) => {
			const [existingBoat] = await db
				.select()
				.from(boat)
				.where(eq(boat.id, input.boatId))
				.limit(1);
			if (!existingBoat) {
				throw new ORPCError("NOT_FOUND", { message: "Boat not found" });
			}

			const [updated] = await db
				.update(boat)
				.set({ approvedAt: null, status: "draft", updatedAt: new Date() })
				.where(eq(boat.id, input.boatId))
				.returning({ id: boat.id });

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Boat not found" });
			}

			try {
				await reconcileBoatCalendarConnectionsOnStateChange({
					boatId: existingBoat.id,
					previousStatus: existingBoat.status,
					previousIsActive: existingBoat.isActive,
					nextStatus: "draft",
					nextIsActive: existingBoat.isActive,
				});
			} catch (error) {
				console.error(
					`Failed to reconcile calendar lifecycle for boat ${existingBoat.id} on approval revoke`,
					error
				);
			}

			return { success: true };
		}),

	// ── Assets / Documents ──────────────────────────────────

	listAssets: adminProcedure
		.route({ summary: "List boat assets for review" })
		.input(
			z.object({
				boatId: z.string().trim().min(1),
				reviewStatus: z.enum(boatAssetReviewStatusValues).optional(),
			})
		)
		.output(z.array(boatAssetOutputSchema))
		.handler(async ({ input }) => {
			const conditions = [eq(boatAsset.boatId, input.boatId)];
			if (input.reviewStatus) {
				conditions.push(eq(boatAsset.reviewStatus, input.reviewStatus));
			}

			return await db
				.select()
				.from(boatAsset)
				.where(and(...conditions))
				.orderBy(boatAsset.sortOrder);
		}),

	reviewAsset: adminProcedure
		.route({ summary: "Review a boat asset" })
		.input(
			z.object({
				assetId: z.string().trim().min(1),
				reviewStatus: z.enum(["approved", "rejected"]),
				reviewNote: optionalTrimmedString(2000),
				expiresAt: z.coerce.date().optional(),
			})
		)
		.output(boatAssetOutputSchema)
		.handler(async ({ input }) => {
			const [existing] = await db
				.select()
				.from(boatAsset)
				.where(eq(boatAsset.id, input.assetId))
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND", { message: "Asset not found" });
			}

			await db
				.update(boatAsset)
				.set({
					reviewStatus: input.reviewStatus,
					reviewNote: input.reviewNote,
					expiresAt: input.expiresAt,
					updatedAt: new Date(),
				})
				.where(eq(boatAsset.id, input.assetId));

			const [updated] = await db
				.select()
				.from(boatAsset)
				.where(eq(boatAsset.id, input.assetId))
				.limit(1);

			if (!updated) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return updated;
		}),

	// ── Docks ───────────────────────────────────────────────

	listDocks: adminProcedure
		.route({ summary: "List docks across all organizations" })
		.input(
			paginationInput.extend({
				organizationId: z.string().trim().optional(),
			})
		)
		.output(
			paginatedOutput(
				dockOutputSchema.extend({
					organizationName: z.string().optional(),
				})
			)
		)
		.handler(async ({ input }) => {
			const where = input.organizationId
				? eq(boatDock.organizationId, input.organizationId)
				: undefined;

			const [rows, countRows] = await Promise.all([
				db
					.select({ dock: boatDock, organizationName: organization.name })
					.from(boatDock)
					.leftJoin(organization, eq(organization.id, boatDock.organizationId))
					.where(where)
					.orderBy(desc(boatDock.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(boatDock).where(where),
			]);

			return {
				items: rows.map((r) => ({
					...r.dock,
					organizationName: r.organizationName ?? undefined,
				})),
				total: countRows[0]?.value ?? 0,
			};
		}),

	// ── Calendar connections (admin) ────────────────────────

	connectCalendar: adminProcedure
		.route({ summary: "Connect a Google Calendar to a boat" })
		.input(
			z.object({
				boatId: z.string().trim().min(1),
				provider: z.enum(calendarProviderValues).default("google"),
				externalCalendarId: z.string().trim().min(1),
				isPrimary: z.boolean().default(true),
			})
		)
		.output(boatCalendarConnectionOutputSchema)
		.handler(async ({ input }) => {
			const [existing] = await db
				.select({ id: boat.id })
				.from(boat)
				.where(eq(boat.id, input.boatId))
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND", { message: "Boat not found" });
			}

			if (input.isPrimary) {
				await db
					.update(boatCalendarConnection)
					.set({ isPrimary: false, updatedAt: new Date() })
					.where(eq(boatCalendarConnection.boatId, input.boatId));
			}

			const connectionId = crypto.randomUUID();

			return await insertAndReturn(boatCalendarConnection, {
				id: connectionId,
				boatId: input.boatId,
				provider: input.provider,
				externalCalendarId: input.externalCalendarId,
				isPrimary: input.isPrimary,
				syncStatus: "idle",
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

	startWebhook: adminProcedure
		.route({ summary: "Start Google Calendar push notification watch" })
		.input(
			z.object({
				boatId: z.string().trim().min(1),
			})
		)
		.output(
			z.object({
				started: z.number(),
				errors: z.array(
					z.object({ connectionId: z.string(), message: z.string() })
				),
			})
		)
		.handler(async ({ input }) => {
			const webhookUrl = env.GOOGLE_CALENDAR_WEBHOOK_URL;
			if (!webhookUrl) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message:
						"GOOGLE_CALENDAR_WEBHOOK_URL is not configured. Start the tunnel or set the env var.",
				});
			}

			const connections = await db
				.select()
				.from(boatCalendarConnection)
				.where(eq(boatCalendarConnection.boatId, input.boatId));

			if (connections.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "No calendar connections found for this boat",
				});
			}

			let started = 0;
			const errors: { connectionId: string; message: string }[] = [];

			for (const conn of connections) {
				const outcome = await startGoogleWatch({
					connectionId: conn.id,
					webhookUrl,
					channelToken: env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN || undefined,
				});

				if (outcome.kind === "ok") {
					started += 1;
				} else {
					errors.push({
						connectionId: conn.id,
						message:
							"message" in outcome
								? (outcome.message as string)
								: "Unknown error",
					});
				}
			}

			return { started, errors };
		}),

	stopWebhook: adminProcedure
		.route({ summary: "Stop Google Calendar push notification watch" })
		.input(
			z.object({
				boatId: z.string().trim().min(1),
			})
		)
		.output(
			z.object({
				stopped: z.number(),
				errors: z.array(
					z.object({ connectionId: z.string(), message: z.string() })
				),
			})
		)
		.handler(async ({ input }) => {
			const connections = await db
				.select()
				.from(boatCalendarConnection)
				.where(eq(boatCalendarConnection.boatId, input.boatId));

			const withWatch = connections.filter((c) => c.watchChannelId);

			if (withWatch.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "No active webhooks found for this boat",
				});
			}

			let stopped = 0;
			const errors: { connectionId: string; message: string }[] = [];

			for (const conn of withWatch) {
				const outcome = await stopGoogleWatch({
					connectionId: conn.id,
				});

				if (outcome.kind === "ok") {
					stopped += 1;
				} else {
					errors.push({
						connectionId: conn.id,
						message:
							"message" in outcome
								? (outcome.message as string)
								: "Unknown error",
					});
				}
			}

			return { stopped, errors };
		}),
};
