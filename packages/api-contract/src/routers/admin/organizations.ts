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

const calendarConnectionObservabilitySchema = z.object({
	id: z.string(),
	listingId: z.string(),
	listingName: z.string().nullable(),
	provider: z.enum(["google", "outlook", "ical", "manual"]),
	externalCalendarId: z.string().nullable(),
	isActive: z.boolean(),
	isPrimary: z.boolean(),
	syncStatus: z.enum(["idle", "syncing", "error", "disabled"]),
	syncRetryCount: z.number().int(),
	lastSyncedAt: z.string().datetime().nullable(),
	lastError: z.string().nullable(),
	watchChannelId: z.string().nullable(),
	watchResourceId: z.string().nullable(),
	watchExpiration: z.string().datetime().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const calendarIngressEventSchema = z.object({
	id: z.string(),
	organizationId: z.string().nullable(),
	calendarConnectionId: z.string().nullable(),
	calendarWebhookEventId: z.string().nullable(),
	provider: z.enum(["google", "outlook", "ical", "manual"]),
	listingId: z.string().nullable(),
	listingName: z.string().nullable(),
	routePath: z.string(),
	method: z.string(),
	host: z.string().nullable(),
	requestId: z.string().nullable(),
	traceId: z.string().nullable(),
	remoteIp: z.string().nullable(),
	userAgent: z.string().nullable(),
	providerChannelId: z.string().nullable(),
	providerResourceId: z.string().nullable(),
	messageNumber: z.number().int().nullable(),
	resourceState: z.string().nullable(),
	status: z.enum([
		"received",
		"accepted",
		"duplicate",
		"unmatched",
		"missing_headers",
		"unauthorized",
		"adapter_not_configured",
		"failed",
	]),
	responseCode: z.number().int().nullable(),
	errorMessage: z.string().nullable(),
	receivedAt: z.string().datetime(),
	processedAt: z.string().datetime().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const calendarWebhookEventSchema = z.object({
	id: z.string(),
	calendarConnectionId: z.string(),
	provider: z.enum(["google", "outlook", "ical", "manual"]),
	listingId: z.string().nullable(),
	listingName: z.string().nullable(),
	providerChannelId: z.string().nullable(),
	providerResourceId: z.string().nullable(),
	messageNumber: z.number().int().nullable(),
	resourceState: z.string().nullable(),
	status: z.enum(["processed", "skipped", "failed"]),
	errorMessage: z.string().nullable(),
	receivedAt: z.string().datetime(),
	processedAt: z.string().datetime().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const calendarIngressStatusCountsSchema = z.object({
	received: z.number().int(),
	accepted: z.number().int(),
	duplicate: z.number().int(),
	unmatched: z.number().int(),
	missing_headers: z.number().int(),
	unauthorized: z.number().int(),
	adapter_not_configured: z.number().int(),
	failed: z.number().int(),
});

const calendarWebhookStatusCountsSchema = z.object({
	processed: z.number().int(),
	skipped: z.number().int(),
	failed: z.number().int(),
});

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

export const getCalendarObservability = oc
	.route({
		summary: "Get calendar observability for an organization",
	})
	.input(
		z.object({
			organizationId: z.string().trim().min(1),
			limit: z.number().int().min(1).max(200).optional(),
		}),
	)
	.output(
		z.object({
			connections: z.array(calendarConnectionObservabilitySchema),
			ingressEvents: z.array(calendarIngressEventSchema),
			ingressStatusCounts: calendarIngressStatusCountsSchema,
			webhookEvents: z.array(calendarWebhookEventSchema),
			webhookStatusCounts: calendarWebhookStatusCountsSchema,
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
	getCalendarObservability,
};
