import { ORPCError } from "@orpc/server";
import { db } from "@my-app/db";
import {
	connectCalendar,
	disconnectCalendar,
	listCalendarConnections,
	type CalendarConnectionRow,
} from "@my-app/calendar";
import { recalculateOrganizationOnboarding } from "../services/organization-onboarding";
import { organizationPermissionProcedure } from "../index";

const formatConnection = (row: CalendarConnectionRow) => ({
	id: row.id,
	listingId: row.listingId,
	organizationId: row.organizationId,
	provider: row.provider,
	externalCalendarId: row.externalCalendarId ?? null,
	syncStatus: row.syncStatus,
	syncRetryCount: row.syncRetryCount,
	lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
	lastError: row.lastError ?? null,
	watchExpiration: row.watchExpiration?.toISOString() ?? null,
	isPrimary: row.isPrimary,
	isActive: row.isActive,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const calendarRouter = {
	connect: organizationPermissionProcedure({
		availability: ["create"],
	}).calendar.connect.handler(async ({ context, input }) => {
		try {
			const row = await connectCalendar(
				{
					listingId: input.listingId,
					organizationId: context.activeMembership.organizationId,
					provider: input.provider,
					calendarId: input.calendarId,
					createdByUserId: context.session?.user?.id,
				},
				db,
			);
			await recalculateOrganizationOnboarding(
				context.activeMembership.organizationId,
				db,
			);
			return formatConnection(row);
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),

	disconnect: organizationPermissionProcedure({
		availability: ["update"],
	}).calendar.disconnect.handler(async ({ context, input }) => {
		try {
			await disconnectCalendar(
				input.connectionId,
				context.activeMembership.organizationId,
				db,
			);
			await recalculateOrganizationOnboarding(
				context.activeMembership.organizationId,
				db,
			);
			return { success: true };
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),

	listConnections: organizationPermissionProcedure({
		availability: ["read"],
	}).calendar.listConnections.handler(async ({ context, input }) => {
		try {
			const rows = await listCalendarConnections(
				input.listingId,
				context.activeMembership.organizationId,
				db,
			);
			return rows.map(formatConnection);
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),
};
