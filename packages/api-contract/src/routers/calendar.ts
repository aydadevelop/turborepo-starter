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
	providers: z.array(z.enum(["google", "outlook", "ical", "manual"])),
});

const calendarOrgWorkspaceStateOutputSchema = z.object({
	accounts: z.array(calendarAccountOutputSchema),
	sources: z.array(calendarSourceOutputSchema),
	connections: z.array(
		calendarConnectionOutputSchema.extend({
			listingName: z.string().nullable(),
		}),
	),
});

export const calendarContract = {
	connectAccount: oc
		.route({
			tags: ["Calendar"],
			summary:
				"Register a connected calendar provider account for the active organization",
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
			summary:
				"Disconnect a calendar provider account from the active organization",
		})
		.input(z.object({ accountId: z.string() }))
		.output(z.object({ success: z.boolean() })),

	listAccounts: oc
		.route({
			tags: ["Calendar"],
			summary:
				"List connected calendar provider accounts for the active organization",
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

	addManualSource: oc
		.route({
			tags: ["Calendar"],
			summary:
				"Register a manually entered calendar ID under a connected provider account",
		})
		.input(
			z.object({
				accountId: z.string().trim(),
				calendarId: z.string().trim().min(1),
				name: z.string().trim().optional(),
			}),
		)
		.output(calendarSourceOutputSchema),

	renameSource: oc
		.route({
			tags: ["Calendar"],
			summary: "Rename a discovered calendar source",
		})
		.input(
			z.object({
				sourceId: z.string(),
				name: z.string().trim().min(1),
			}),
		)
		.output(calendarSourceOutputSchema),

	deleteSource: oc
		.route({
			tags: ["Calendar"],
			summary:
				"Delete a calendar source from the organization and detach active listing connections",
		})
		.input(
			z.object({
				sourceId: z.string(),
			}),
		)
		.output(
			z.object({
				success: z.boolean(),
				sourceId: z.string(),
				disabledConnectionIds: z.array(z.string()),
			}),
		),

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

	disable: oc
		.route({
			tags: ["Calendar"],
			summary:
				"Disable a calendar connection so it stops affecting availability and sync",
		})
		.input(z.object({ connectionId: z.string() }))
		.output(calendarConnectionOutputSchema),

	enable: oc
		.route({
			tags: ["Calendar"],
			summary:
				"Enable a calendar connection and resync future availability from now forward",
		})
		.input(z.object({ connectionId: z.string() }))
		.output(calendarConnectionOutputSchema),

	disconnect: oc
		.route({
			tags: ["Calendar"],
			summary:
				"Legacy alias for disabling an external calendar connection",
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

	getOrgWorkspaceState: oc
		.route({
			tags: ["Calendar"],
			summary:
				"Get calendar workspace state across all listings in the organization",
		})
		.input(z.object({}))
		.output(calendarOrgWorkspaceStateOutputSchema),

	setSourceVisibility: oc
		.route({
			tags: ["Calendar"],
			summary: "Show or hide a discovered calendar source",
		})
		.input(
			z.object({
				sourceId: z.string(),
				isHidden: z.boolean(),
			}),
		)
		.output(calendarSourceOutputSchema),
};
