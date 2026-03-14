import { oc } from "@orpc/contract";
import z from "zod";
import { successOutputSchema } from "../../contracts/shared";
import {
	invitationSchema,
	memberSchema,
	organizationSchema,
	paginatedOutput,
	paginationInput,
	userSchema,
} from "./shared";

export const listOrgs = oc
	.route({ summary: "List all organizations" })
	.input(paginationInput.extend({ search: z.string().trim().optional() }))
	.output(paginatedOutput(organizationSchema));

export const getOrg = oc
	.route({ summary: "Get organization by ID" })
	.input(z.object({ id: z.string().trim().min(1) }))
	.output(organizationSchema);

export const updateOrg = oc
	.route({ summary: "Update an organization" })
	.input(
		z.object({
			id: z.string().trim().min(1),
			name: z.string().trim().min(1).optional(),
			slug: z.string().trim().min(1).optional(),
			logo: z.string().trim().optional(),
			metadata: z.string().trim().optional(),
		}),
	)
	.output(successOutputSchema);

export const listMembers = oc
	.route({ summary: "List members of an organization" })
	.input(
		paginationInput.extend({
			organizationId: z.string().trim().min(1),
		}),
	)
	.output(
		paginatedOutput(
			memberSchema.extend({
				userName: z.string().optional(),
				userEmail: z.string().optional(),
			}),
		),
	);

export const updateMemberRole = oc
	.route({ summary: "Change a member's role within an organization" })
	.input(
		z.object({
			memberId: z.string().trim().min(1),
			role: z.string().trim().min(1),
		}),
	)
	.output(successOutputSchema);

export const removeMember = oc
	.route({ summary: "Remove a member from an organization" })
	.input(z.object({ memberId: z.string().trim().min(1) }))
	.output(successOutputSchema);

export const listInvitations = oc
	.route({ summary: "List invitations for an organization" })
	.input(
		paginationInput.extend({
			organizationId: z.string().trim().min(1),
			status: z
				.enum(["pending", "accepted", "rejected", "cancelled"])
				.optional(),
		}),
	)
	.output(paginatedOutput(invitationSchema));

export const listUsers = oc
	.route({ summary: "List all users" })
	.input(
		paginationInput.extend({
			search: z.string().trim().optional(),
			role: z.string().trim().optional(),
			banned: z.boolean().optional(),
		}),
	)
	.output(
		paginatedOutput(
			userSchema.extend({
				organizationCount: z.number(),
			}),
		),
	);

export const getUser = oc
	.route({ summary: "Get user by ID" })
	.input(z.object({ id: z.string().trim().min(1) }))
	.output(
		userSchema.extend({
			memberships: z.array(
				memberSchema.extend({
					organizationName: z.string().optional(),
					organizationSlug: z.string().optional(),
				}),
			),
		}),
	);

export const adminOrganizationsContract = {
	listOrgs,
	getOrg,
	updateOrg,
	listMembers,
	updateMemberRole,
	removeMember,
	listInvitations,
	listUsers,
	getUser,
};
