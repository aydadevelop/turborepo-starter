import { db } from "@full-stack-cf-app/db";
import {
	invitation,
	member,
	organization,
	user,
} from "@full-stack-cf-app/db/schema/auth";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, inArray, like, or, type SQL } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import z from "zod";

import { adminProcedure } from "../../lib/admin";
import { buildUpdatePayload } from "../../lib/db-helpers";
import { successOutputSchema } from "../shared/schema-utils";
import { paginatedOutput, paginationInput } from "./shared";

const organizationOutputSchema = createSelectSchema(organization);
const memberOutputSchema = createSelectSchema(member);
const invitationOutputSchema = createSelectSchema(invitation);
const userOutputSchema = createSelectSchema(user);

export const adminOrganizationsRouter = {
	listOrgs: adminProcedure
		.route({ summary: "List all organizations" })
		.input(paginationInput.extend({ search: z.string().trim().optional() }))
		.output(paginatedOutput(organizationOutputSchema))
		.handler(async ({ input }) => {
			const where = input.search
				? or(
						like(organization.name, `%${input.search}%`),
						like(organization.slug, `%${input.search}%`)
					)
				: undefined;

			const [items, countRows] = await Promise.all([
				db
					.select()
					.from(organization)
					.where(where)
					.orderBy(desc(organization.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(organization).where(where),
			]);

			return { items, total: countRows[0]?.value ?? 0 };
		}),

	getOrg: adminProcedure
		.route({ summary: "Get organization by ID" })
		.input(z.object({ id: z.string().trim().min(1) }))
		.output(organizationOutputSchema)
		.handler(async ({ input }) => {
			const [org] = await db
				.select()
				.from(organization)
				.where(eq(organization.id, input.id))
				.limit(1);

			if (!org) {
				throw new ORPCError("NOT_FOUND", {
					message: "Organization not found",
				});
			}

			return org;
		}),

	updateOrg: adminProcedure
		.route({ summary: "Update an organization" })
		.input(
			z.object({
				id: z.string().trim().min(1),
				name: z.string().trim().min(1).optional(),
				slug: z.string().trim().min(1).optional(),
				logo: z.string().trim().optional(),
				metadata: z.string().trim().optional(),
			})
		)
		.output(successOutputSchema)
		.handler(async ({ input }) => {
			const { id, ...fields } = input;
			const payload = buildUpdatePayload(fields);

			const [updated] = await db
				.update(organization)
				.set(payload)
				.where(eq(organization.id, id))
				.returning({ id: organization.id });

			if (!updated) {
				throw new ORPCError("NOT_FOUND", {
					message: "Organization not found",
				});
			}

			return { success: true };
		}),

	listMembers: adminProcedure
		.route({ summary: "List members of an organization" })
		.input(
			paginationInput.extend({
				organizationId: z.string().trim().min(1),
			})
		)
		.output(
			paginatedOutput(
				memberOutputSchema.extend({
					userName: z.string().optional(),
					userEmail: z.string().optional(),
				})
			)
		)
		.handler(async ({ input }) => {
			const where = eq(member.organizationId, input.organizationId);

			const [items, countRows] = await Promise.all([
				db
					.select({
						member,
						userName: user.name,
						userEmail: user.email,
					})
					.from(member)
					.leftJoin(user, eq(user.id, member.userId))
					.where(where)
					.orderBy(desc(member.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(member).where(where),
			]);

			return {
				items: items.map((row) => ({
					...row.member,
					userName: row.userName ?? undefined,
					userEmail: row.userEmail ?? undefined,
				})),
				total: countRows[0]?.value ?? 0,
			};
		}),

	updateMemberRole: adminProcedure
		.route({ summary: "Change a member's role within an organization" })
		.input(
			z.object({
				memberId: z.string().trim().min(1),
				role: z.string().trim().min(1),
			})
		)
		.output(successOutputSchema)
		.handler(async ({ input }) => {
			const [updated] = await db
				.update(member)
				.set({ role: input.role })
				.where(eq(member.id, input.memberId))
				.returning({ id: member.id });

			if (!updated) {
				throw new ORPCError("NOT_FOUND", {
					message: "Member not found",
				});
			}

			return { success: true };
		}),

	removeMember: adminProcedure
		.route({ summary: "Remove a member from an organization" })
		.input(z.object({ memberId: z.string().trim().min(1) }))
		.output(successOutputSchema)
		.handler(async ({ input }) => {
			const [deleted] = await db
				.delete(member)
				.where(eq(member.id, input.memberId))
				.returning({ id: member.id });

			if (!deleted) {
				throw new ORPCError("NOT_FOUND", {
					message: "Member not found",
				});
			}

			return { success: true };
		}),

	listInvitations: adminProcedure
		.route({ summary: "List invitations for an organization" })
		.input(
			paginationInput.extend({
				organizationId: z.string().trim().min(1),
				status: z
					.enum(["pending", "accepted", "rejected", "cancelled"])
					.optional(),
			})
		)
		.output(paginatedOutput(invitationOutputSchema))
		.handler(async ({ input }) => {
			const where = and(
				eq(invitation.organizationId, input.organizationId),
				input.status ? eq(invitation.status, input.status) : undefined
			);

			const [rows, countRows] = await Promise.all([
				db
					.select()
					.from(invitation)
					.where(where)
					.orderBy(desc(invitation.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(invitation).where(where),
			]);

			return { items: rows, total: countRows[0]?.value ?? 0 };
		}),

	listUsers: adminProcedure
		.route({ summary: "List all users" })
		.input(
			paginationInput.extend({
				search: z.string().trim().optional(),
				role: z.string().trim().optional(),
				banned: z.boolean().optional(),
			})
		)
		.output(
			paginatedOutput(
				userOutputSchema.extend({
					organizationCount: z.number(),
				})
			)
		)
		.handler(async ({ input }) => {
			const conditions: SQL[] = [];

			if (input.search) {
				const searchCondition = or(
					like(user.name, `%${input.search}%`),
					like(user.email, `%${input.search}%`)
				);
				if (searchCondition) {
					conditions.push(searchCondition);
				}
			}
			if (input.role) {
				conditions.push(eq(user.role, input.role));
			}
			if (input.banned !== undefined) {
				conditions.push(eq(user.banned, input.banned));
			}

			const where = conditions.length > 0 ? and(...conditions) : undefined;

			const [users, countRows] = await Promise.all([
				db
					.select()
					.from(user)
					.where(where)
					.orderBy(desc(user.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(user).where(where),
			]);
			const total = countRows[0]?.value ?? 0;

			// Count memberships per user in a single query
			const userIds = users.map((u) => u.id);
			const membershipCounts =
				userIds.length > 0
					? await db
							.select({
								userId: member.userId,
								orgCount: count(),
							})
							.from(member)
							.where(inArray(member.userId, userIds))
							.groupBy(member.userId)
					: [];

			const countMap = new Map(
				membershipCounts.map((m) => [m.userId, m.orgCount])
			);

			return {
				items: users.map((u) => ({
					...u,
					organizationCount: countMap.get(u.id) ?? 0,
				})),
				total,
			};
		}),

	getUser: adminProcedure
		.route({ summary: "Get user by ID" })
		.input(z.object({ id: z.string().trim().min(1) }))
		.output(
			userOutputSchema.extend({
				memberships: z.array(
					memberOutputSchema.extend({
						organizationName: z.string().optional(),
						organizationSlug: z.string().optional(),
					})
				),
			})
		)
		.handler(async ({ input }) => {
			const [dbUser] = await db
				.select()
				.from(user)
				.where(eq(user.id, input.id))
				.limit(1);

			if (!dbUser) {
				throw new ORPCError("NOT_FOUND", { message: "User not found" });
			}

			const memberships = await db
				.select({
					member,
					organizationName: organization.name,
					organizationSlug: organization.slug,
				})
				.from(member)
				.leftJoin(organization, eq(organization.id, member.organizationId))
				.where(eq(member.userId, input.id));

			return {
				...dbUser,
				memberships: memberships.map((m) => ({
					...m.member,
					organizationName: m.organizationName ?? undefined,
					organizationSlug: m.organizationSlug ?? undefined,
				})),
			};
		}),
};
