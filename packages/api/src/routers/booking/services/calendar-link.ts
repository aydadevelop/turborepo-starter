import { db } from "@full-stack-cf-app/db";
import { boatCalendarConnection } from "@full-stack-cf-app/db/schema/boat";
import { and, eq, ne } from "drizzle-orm";
import { getCalendarAdapter } from "../../../calendar/adapters/registry";
import type { CreateManagedBookingCalendarLinkInput } from "../helpers";

export const resolvePrimaryCalendarLinkInput = async (params: {
	boatId: string;
}): Promise<CreateManagedBookingCalendarLinkInput> => {
	const [primaryConnection] = await db
		.select()
		.from(boatCalendarConnection)
		.where(
			and(
				eq(boatCalendarConnection.boatId, params.boatId),
				eq(boatCalendarConnection.isPrimary, true),
				ne(boatCalendarConnection.syncStatus, "disabled")
			)
		)
		.limit(1);

	if (primaryConnection) {
		const adapter = getCalendarAdapter(primaryConnection.provider);
		if (!adapter) {
			return {
				boatCalendarConnectionId: undefined,
				provider: "manual",
				externalCalendarId: undefined,
				externalEventId: `booking-${crypto.randomUUID()}`,
				iCalUid: undefined,
				externalEventVersion: undefined,
				syncedAt: undefined,
			};
		}

		return {
			boatCalendarConnectionId: primaryConnection.id,
			provider: primaryConnection.provider,
			externalCalendarId: primaryConnection.externalCalendarId,
			externalEventId: `booking-${crypto.randomUUID()}`,
			iCalUid: undefined,
			externalEventVersion: undefined,
			syncedAt: undefined,
		};
	}

	return {
		boatCalendarConnectionId: undefined,
		provider: "manual",
		externalCalendarId: undefined,
		externalEventId: `booking-${crypto.randomUUID()}`,
		iCalUid: undefined,
		externalEventVersion: undefined,
		syncedAt: undefined,
	};
};
