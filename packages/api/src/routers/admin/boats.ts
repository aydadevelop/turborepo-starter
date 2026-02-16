import { db } from "@full-stack-cf-app/db";
import { organization } from "@full-stack-cf-app/db/schema/auth";
import {
	boat,
	boatAsset,
	boatAssetReviewStatusValues,
	boatDock,
} from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, isNull, like, or, type SQL } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import z from "zod";

import { adminProcedure } from "../../lib/admin";
import { buildUpdatePayload } from "../../lib/db-helpers";
import {
	optionalTrimmedString,
	successOutputSchema,
} from "../shared/schema-utils";
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

			const [rows, countRows] = await Promise.all([
				db
					.select({ boat, organizationName: organization.name })
					.from(boat)
					.leftJoin(organization, eq(organization.id, boat.organizationId))
					.where(where)
					.orderBy(desc(boat.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(boat).where(where),
			]);

			return {
				items: rows.map((r) => ({
					...r.boat,
					organizationName: r.organizationName ?? undefined,
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
			const payload = buildUpdatePayload(fields);

			const [updated] = await db
				.update(boat)
				.set(payload)
				.where(eq(boat.id, id))
				.returning({ id: boat.id });

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Boat not found" });
			}

			return { success: true };
		}),

	// ── Approval (merged from boat-review) ──────────────────

	approveBoat: adminProcedure
		.route({ summary: "Approve a boat" })
		.input(z.object({ boatId: z.string().trim().min(1) }))
		.output(successOutputSchema)
		.handler(async ({ input }) => {
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

			return { success: true };
		}),

	revokeApproval: adminProcedure
		.route({ summary: "Revoke boat approval" })
		.input(z.object({ boatId: z.string().trim().min(1) }))
		.output(successOutputSchema)
		.handler(async ({ input }) => {
			const [updated] = await db
				.update(boat)
				.set({ approvedAt: null, status: "draft", updatedAt: new Date() })
				.where(eq(boat.id, input.boatId))
				.returning({ id: boat.id });

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Boat not found" });
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
};
