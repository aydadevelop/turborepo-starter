import { db } from "@full-stack-cf-app/db";
import {
	boat,
	boatCalendarConnection,
	boatDock,
} from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

export const requireManagedBoat = async (
	boatId: string,
	organizationId: string
) => {
	const [managedBoat] = await db
		.select()
		.from(boat)
		.where(and(eq(boat.id, boatId), eq(boat.organizationId, organizationId)))
		.limit(1);

	if (!managedBoat) {
		throw new ORPCError("NOT_FOUND");
	}

	return managedBoat;
};

export const requireManagedDock = async (
	dockId: string,
	organizationId: string
) => {
	const [managedDock] = await db
		.select()
		.from(boatDock)
		.where(
			and(eq(boatDock.id, dockId), eq(boatDock.organizationId, organizationId))
		)
		.limit(1);

	if (!managedDock) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Dock does not belong to the active organization",
		});
	}

	return managedDock;
};

export const requireCalendarConnectionForBoat = async (
	calendarConnectionId: string,
	boatId: string
) => {
	const [connection] = await db
		.select()
		.from(boatCalendarConnection)
		.where(
			and(
				eq(boatCalendarConnection.id, calendarConnectionId),
				eq(boatCalendarConnection.boatId, boatId)
			)
		)
		.limit(1);

	if (!connection) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Calendar connection does not belong to this boat",
		});
	}

	return connection;
};
