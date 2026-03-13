import { oc } from "@orpc/contract";
import z from "zod";

const calendarConnectionOutputSchema = z.object({
	id: z.string(),
	listingId: z.string(),
	organizationId: z.string(),
	calendarAccountId: z.string().nullable(),
	calendarSourceId: z.string().nullable(),
	provider: z.enum(["google", "outlook", "ical", "manual"]),
	externalCalendarId: z.string().nullable(),
	syncStatus: z.enum(["idle", "syncing", "error", "disabled"]),
	syncRetryCount: z.number().int(),
	lastSyncedAt: z.string().datetime().nullable(),
	lastError: z.string().nullable(),
	watchExpiration: z.string().datetime().nullable(),
	isPrimary: z.boolean(),
	isActive: z.boolean(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const calendarAccountOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	provider: z.enum(["google", "outlook", "ical", "manual"]),
	externalAccountId: z.string(),
	accountEmail: z.string().nullable(),
	displayName: z.string().nullable(),
	status: z.enum(["connected", "error", "disconnected"]),
	lastSyncedAt: z.string().datetime().nullable(),
	lastError: z.string().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const calendarSourceOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	calendarAccountId: z.string(),
	provider: z.enum(["google", "outlook", "ical", "manual"]),
	externalCalendarId: z.string(),
	name: z.string(),
	timezone: z.string().nullable(),
	isPrimary: z.boolean(),
	isHidden: z.boolean(),
	isActive: z.boolean(),
	lastDiscoveredAt: z.string().datetime(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const calendarWorkspaceStateOutputSchema = z.object({
	accountCount: z.number().int(),
	connectedAccountCount: z.number().int(),
	accounts: z.array(calendarAccountOutputSchema),
	sourceCount: z.number().int(),
	activeSourceCount: z.number().int(),
	sources: z.array(calendarSourceOutputSchema),
	activeConnectionCount: z.number().int(),
	connections: z.array(calendarConnectionOutputSchema),
	hasConnectedCalendar: z.boolean(),
	hasPrimaryConnection: z.boolean(),
	primaryConnectionId: z.string().nullable(),
	providers: z.array(z.enum(["google", "outlook", "ical", "manual"])),
});

export const calendarContract = {
	connectAccount: oc
		.route({
			tags: ["Calendar"],
			summary: "Register a connected calendar provider account for the active organization",
		})
		.input(
			z.object({
				provider: z.enum(["google", "outlook", "ical", "manual"]),
				externalAccountId: z.string().trim().min(1),
				accountEmail: z.string().email().optional(),
				displayName: z.string().trim().min(1).optional(),
			}),
		)
		.output(calendarAccountOutputSchema),

	disconnectAccount: oc
		.route({
			tags: ["Calendar"],
			summary: "Disconnect a calendar provider account from the active organization",
		})
		.input(z.object({ accountId: z.string() }))
		.output(z.object({ success: z.boolean() })),

	listAccounts: oc
		.route({
			tags: ["Calendar"],
			summary: "List connected calendar provider accounts for the active organization",
		})
		.input(z.object({}))
		.output(z.array(calendarAccountOutputSchema)),

	refreshAccountSources: oc
		.route({
			tags: ["Calendar"],
			summary: "Refresh discovered calendars for a connected provider account",
		})
		.input(z.object({ accountId: z.string() }))
		.output(z.array(calendarSourceOutputSchema)),

	listSources: oc
		.route({
			tags: ["Calendar"],
			summary: "List discovered calendars for the active organization",
		})
		.input(
			z.object({
				accountId: z.string().optional(),
			}),
		)
		.output(z.array(calendarSourceOutputSchema)),

	connect: oc
		.route({
			tags: ["Calendar"],
			summary: "Connect an external calendar to a listing",
		})
		.input(
			z.object({
				listingId: z.string(),
				provider: z.enum(["google", "outlook", "ical", "manual"]),
				calendarId: z.string().trim().min(1),
			}),
		)
		.output(calendarConnectionOutputSchema),

	attachSource: oc
		.route({
			tags: ["Calendar"],
			summary: "Attach a discovered calendar source to a listing",
		})
		.input(
			z.object({
				listingId: z.string(),
				sourceId: z.string(),
			}),
		)
		.output(calendarConnectionOutputSchema),

	disconnect: oc
		.route({
			tags: ["Calendar"],
			summary: "Disconnect an external calendar connection",
		})
		.input(z.object({ connectionId: z.string() }))
		.output(z.object({ success: z.boolean() })),

	listConnections: oc
		.route({
			tags: ["Calendar"],
			summary: "List calendar connections for a listing",
		})
		.input(z.object({ listingId: z.string() }))
		.output(z.array(calendarConnectionOutputSchema)),

	getWorkspaceState: oc
		.route({
			tags: ["Calendar"],
			summary: "Get calendar workspace state for a listing",
		})
		.input(z.object({ listingId: z.string() }))
		.output(calendarWorkspaceStateOutputSchema),
};
