import { db } from "@full-stack-cf-app/db";
import {
	booking,
	bookingCalendarLink,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { getCalendarAdapter } from "../../../calendar/adapters/registry";
import type {
	CalendarSyncResult,
	CreateManagedBookingCalendarLinkInput,
	CreateManagedBookingInput,
} from "../helpers";

const toSyncErrorMessage = (error: unknown) => {
	if (error instanceof Error) {
		return error.message;
	}

	return "Unknown calendar sync error";
};

export const syncCalendarLinkOnBookingCreate = async (params: {
	bookingId: string;
	organizationId: string;
	boatId: string;
	boatName: string;
	source: CreateManagedBookingInput["source"];
	startsAt: Date;
	endsAt: Date;
	timezone: string;
	contactName?: string;
	notes?: string;
	calendarLink: CreateManagedBookingCalendarLinkInput;
}): Promise<CalendarSyncResult> => {
	if (!params.calendarLink.externalCalendarId) {
		return {
			status: "linked",
			calendarLinkUpdate: {
				syncError: null,
				syncedAt: params.calendarLink.syncedAt ?? new Date(),
			},
		};
	}

	const adapter = getCalendarAdapter(params.calendarLink.provider);
	if (!adapter) {
		return {
			status: "linked",
			calendarLinkUpdate: {
				syncError: null,
				syncedAt: params.calendarLink.syncedAt ?? new Date(),
			},
		};
	}

	try {
		const syncedEvent = await adapter.upsertEvent({
			externalCalendarId: params.calendarLink.externalCalendarId,
			externalEventId: params.calendarLink.externalEventId,
			title: params.contactName
				? `${params.boatName} booking for ${params.contactName}`
				: `${params.boatName} booking`,
			startsAt: params.startsAt,
			endsAt: params.endsAt,
			timezone: params.timezone,
			description: params.notes,
			metadata: {
				bookingId: params.bookingId,
				organizationId: params.organizationId,
				boatId: params.boatId,
				source: params.source,
			},
		});

		return {
			status: "linked",
			calendarLinkUpdate: {
				externalCalendarId: syncedEvent.externalCalendarId,
				externalEventId: syncedEvent.externalEventId,
				iCalUid: syncedEvent.iCalUid ?? params.calendarLink.iCalUid,
				externalEventVersion:
					syncedEvent.version ?? params.calendarLink.externalEventVersion,
				syncedAt: syncedEvent.syncedAt,
				syncError: null,
			},
		};
	} catch (error) {
		return {
			status: "sync_error",
			calendarLinkUpdate: {
				syncError: toSyncErrorMessage(error),
			},
		};
	}
};

export const syncCalendarLinkOnBookingCancel = async (params: {
	calendarLink: typeof bookingCalendarLink.$inferSelect;
}): Promise<CalendarSyncResult> => {
	if (!params.calendarLink.externalCalendarId) {
		return {
			status: "detached",
			calendarLinkUpdate: {
				syncError: null,
				syncedAt: new Date(),
			},
		};
	}

	const adapter = getCalendarAdapter(params.calendarLink.provider);
	if (!adapter) {
		return {
			status: "detached",
			calendarLinkUpdate: {
				syncError: null,
				syncedAt: new Date(),
			},
		};
	}

	try {
		await adapter.deleteEvent({
			externalCalendarId: params.calendarLink.externalCalendarId,
			externalEventId: params.calendarLink.externalEventId,
		});

		return {
			status: "detached",
			calendarLinkUpdate: {
				syncError: null,
				syncedAt: new Date(),
			},
		};
	} catch (error) {
		return {
			status: "sync_error",
			calendarLinkUpdate: {
				syncError: toSyncErrorMessage(error),
			},
		};
	}
};

export const syncCalendarLinkOnBookingUpdate = async (params: {
	managedBooking: typeof booking.$inferSelect;
	boatName: string;
	calendarLink?: typeof bookingCalendarLink.$inferSelect | null;
}): Promise<CalendarSyncResult> => {
	const calendarLink = params.calendarLink;
	if (!(calendarLink && calendarLink.externalCalendarId)) {
		return {
			status: "linked",
			calendarLinkUpdate: {
				syncError: null,
				syncedAt: new Date(),
			},
		};
	}

	const adapter = getCalendarAdapter(calendarLink.provider);
	if (!adapter) {
		return {
			status: "linked",
			calendarLinkUpdate: {
				syncError: null,
				syncedAt: new Date(),
			},
		};
	}

	try {
		const syncedEvent = await adapter.upsertEvent({
			externalCalendarId: calendarLink.externalCalendarId,
			externalEventId: calendarLink.externalEventId,
			title: params.managedBooking.contactName
				? `${params.boatName} booking for ${params.managedBooking.contactName}`
				: `${params.boatName} booking`,
			startsAt: params.managedBooking.startsAt,
			endsAt: params.managedBooking.endsAt,
			timezone: params.managedBooking.timezone,
			description: params.managedBooking.notes ?? undefined,
			metadata: {
				bookingId: params.managedBooking.id,
				organizationId: params.managedBooking.organizationId,
				boatId: params.managedBooking.boatId,
				source: params.managedBooking.source,
			},
		});

		return {
			status: "linked",
			calendarLinkUpdate: {
				externalCalendarId: syncedEvent.externalCalendarId,
				externalEventId: syncedEvent.externalEventId,
				iCalUid: syncedEvent.iCalUid ?? calendarLink.iCalUid,
				externalEventVersion:
					syncedEvent.version ?? calendarLink.externalEventVersion,
				syncedAt: syncedEvent.syncedAt,
				syncError: null,
			},
		};
	} catch (error) {
		return {
			status: "sync_error",
			calendarLinkUpdate: {
				syncError: toSyncErrorMessage(error),
			},
		};
	}
};

export const ensureNoExternalCalendarOverlap = async (params: {
	provider: CreateManagedBookingCalendarLinkInput["provider"];
	externalCalendarId?: string;
	startsAt: Date;
	endsAt: Date;
}) => {
	if (!params.externalCalendarId) {
		return;
	}

	const adapter = getCalendarAdapter(params.provider);
	if (!adapter) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Calendar provider '${params.provider}' is not configured`,
		});
	}

	try {
		const busyIntervals = await adapter.listBusyIntervals({
			externalCalendarId: params.externalCalendarId,
			from: params.startsAt,
			to: params.endsAt,
		});

		if (busyIntervals.length > 0) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"External calendar has overlapping events for the selected booking window",
			});
		}
	} catch (error) {
		if (error instanceof ORPCError) {
			throw error;
		}
		throw new ORPCError("BAD_REQUEST", {
			message: `Failed to verify external calendar availability: ${toSyncErrorMessage(error)}`,
		});
	}
};

export const cancelBookingAndSync = async (params: {
	managedBooking: typeof booking.$inferSelect;
	cancelledByUserId?: string;
	reason?: string;
}) => {
	if (params.managedBooking.status === "cancelled") {
		return { success: true };
	}

	const [managedCalendarLink] = await db
		.select()
		.from(bookingCalendarLink)
		.where(eq(bookingCalendarLink.bookingId, params.managedBooking.id))
		.limit(1);

	await db
		.update(booking)
		.set({
			status: "cancelled",
			calendarSyncStatus: "pending",
			cancelledAt: new Date(),
			cancelledByUserId: params.cancelledByUserId,
			cancellationReason: params.reason,
			updatedAt: new Date(),
		})
		.where(eq(booking.id, params.managedBooking.id));

	const calendarSyncResult = managedCalendarLink
		? await syncCalendarLinkOnBookingCancel({
				calendarLink: managedCalendarLink,
			})
		: {
				status: "detached" as const,
				calendarLinkUpdate: {},
			};

	if (managedCalendarLink) {
		await db
			.update(bookingCalendarLink)
			.set({
				...calendarSyncResult.calendarLinkUpdate,
				updatedAt: new Date(),
			})
			.where(eq(bookingCalendarLink.id, managedCalendarLink.id));
	}

	await db
		.update(booking)
		.set({
			calendarSyncStatus: calendarSyncResult.status,
			updatedAt: new Date(),
		})
		.where(eq(booking.id, params.managedBooking.id));

	return { success: true };
};
