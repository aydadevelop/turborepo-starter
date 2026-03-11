import { oc } from "@orpc/contract";
import z from "zod";

const calendarConnectionOutputSchema = z.object({
	id: z.string(),
	listingId: z.string(),
	organizationId: z.string(),
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

export const calendarContract = {
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
};
