import {
	boat,
	boatCalendarConnection,
	boatDock,
} from "@full-stack-cf-app/db/schema/boat";
import { requireManaged, requireOwned } from "../../lib/db-helpers";

export const requireManagedBoat = (boatId: string, organizationId: string) =>
	requireManaged(boat, boatId, organizationId);

export const requireManagedDock = (dockId: string, organizationId: string) =>
	requireManaged(
		boatDock,
		dockId,
		organizationId,
		"Dock does not belong to the active organization"
	);

export const requireCalendarConnectionForBoat = (
	calendarConnectionId: string,
	boatId: string
) =>
	requireOwned(
		boatCalendarConnection,
		boatCalendarConnection.id,
		calendarConnectionId,
		boatCalendarConnection.boatId,
		boatId,
		"Calendar connection does not belong to this boat"
	);
