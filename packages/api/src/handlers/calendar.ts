import {
	addOrganizationManualCalendarSource,
	attachCalendarSourceToListing,
	type CalendarAccountRow,
	type CalendarConnectionRow,
	type CalendarSourceRow,
	connectCalendar,
	connectOrganizationCalendarAccount,
	deleteOrganizationCalendarSource,
	disableCalendarConnection,
	disconnectCalendar,
	disconnectOrganizationCalendarAccount,
	enableCalendarConnection,
	getCalendarWorkspaceState,
	getOrgCalendarWorkspaceState,
	listCalendarConnections,
	listOrganizationCalendarAccounts,
	listOrganizationCalendarSources,
	renameOrganizationCalendarSource,
	refreshOrganizationCalendarSources,
	setSourceVisibility,
} from "@my-app/calendar";
import { db } from "@my-app/db";
import { ORPCError } from "@orpc/server";
import { organizationPermissionProcedure } from "../index";

const formatConnection = (row: CalendarConnectionRow) => ({
	id: row.id,
	listingId: row.listingId,
	organizationId: row.organizationId,
	calendarAccountId: row.calendarAccountId ?? null,
	calendarSourceId: row.calendarSourceId ?? null,
	provider: row.provider,
	externalCalendarId: row.externalCalendarId ?? null,
	syncStatus: row.syncStatus,
	syncRetryCount: row.syncRetryCount,
	lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
	lastError: row.lastError ?? null,
	watchExpiration: row.watchExpiration?.toISOString() ?? null,
	isActive: row.isActive,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const formatSource = (row: CalendarSourceRow) => ({
	id: row.id,
	organizationId: row.organizationId,
	calendarAccountId: row.calendarAccountId,
	provider: row.provider,
	externalCalendarId: row.externalCalendarId,
	name: row.name,
	timezone: row.timezone ?? null,
	isPrimary: row.isPrimary,
	isHidden: row.isHidden,
	isActive: row.isActive,
	lastDiscoveredAt: row.lastDiscoveredAt.toISOString(),
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const formatAccount = (row: CalendarAccountRow) => ({
	id: row.id,
	organizationId: row.organizationId,
	provider: row.provider,
	externalAccountId: row.externalAccountId,
	accountEmail: row.accountEmail ?? null,
	displayName: row.displayName ?? null,
	status: row.status,
	lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
	lastError: row.lastError ?? null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const calendarRouter = {
	connectAccount: organizationPermissionProcedure({
		availability: ["create"],
	}).calendar.connectAccount.handler(async ({ context, input }) => {
		const row = await connectOrganizationCalendarAccount(
			{
				organizationId: context.activeMembership.organizationId,
				provider: input.provider,
				externalAccountId: input.externalAccountId,
				accountEmail: input.accountEmail,
				displayName: input.displayName,
				createdByUserId: context.session?.user?.id,
			},
			db,
		);

		return formatAccount(row);
	}),

	disconnectAccount: organizationPermissionProcedure({
		availability: ["update"],
	}).calendar.disconnectAccount.handler(async ({ context, input }) => {
		try {
			await disconnectOrganizationCalendarAccount(
				input.accountId,
				context.activeMembership.organizationId,
				db,
				{
					actorUserId: context.session?.user?.id ?? undefined,
					eventBus: context.eventBus,
				},
			);
			return { success: true };
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),

	listAccounts: organizationPermissionProcedure({
		availability: ["read"],
	}).calendar.listAccounts.handler(async ({ context }) => {
		const rows = await listOrganizationCalendarAccounts(
			context.activeMembership.organizationId,
			db,
		);

		return rows.map(formatAccount);
	}),

	addManualSource: organizationPermissionProcedure({
		availability: ["create"],
	}).calendar.addManualSource.handler(async ({ context, input }) => {
		try {
			const row = await addOrganizationManualCalendarSource(
				{
					accountId: input.accountId || undefined,
					calendarId: input.calendarId,
					name: input.name,
					createdByUserId: context.session?.user?.id,
					organizationId: context.activeMembership.organizationId,
				},
				db,
			);
			return formatSource(row);
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),

	renameSource: organizationPermissionProcedure({
		availability: ["update"],
	}).calendar.renameSource.handler(async ({ context, input }) => {
		try {
			const row = await renameOrganizationCalendarSource(
				input.sourceId,
				context.activeMembership.organizationId,
				input.name,
				db,
			);
			return formatSource(row);
		} catch (error) {
			if (error instanceof Error) {
				if (error.message === "NOT_FOUND") {
					throw new ORPCError("NOT_FOUND");
				}
				if (error.message === "BAD_REQUEST") {
					throw new ORPCError("BAD_REQUEST");
				}
			}
			throw error;
		}
	}),

	deleteSource: organizationPermissionProcedure({
		availability: ["update"],
	}).calendar.deleteSource.handler(async ({ context, input }) => {
		try {
			const result = await deleteOrganizationCalendarSource(
				input.sourceId,
				context.activeMembership.organizationId,
				db,
				{
					actorUserId: context.session?.user?.id ?? undefined,
					eventBus: context.eventBus,
				},
			);
			return {
				success: true,
				...result,
			};
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),

	refreshAccountSources: organizationPermissionProcedure({
		availability: ["update"],
	}).calendar.refreshAccountSources.handler(async ({ context, input }) => {
		try {
			const rows = await refreshOrganizationCalendarSources(
				input.accountId,
				context.activeMembership.organizationId,
				db,
			);
			return rows.map(formatSource);
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),

	listSources: organizationPermissionProcedure({
		availability: ["read"],
	}).calendar.listSources.handler(async ({ context, input }) => {
		const rows = await listOrganizationCalendarSources(
			context.activeMembership.organizationId,
			db,
			input.accountId,
		);

		return rows.map(formatSource);
	}),

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
				{
					actorUserId: context.session?.user?.id ?? undefined,
					eventBus: context.eventBus,
				},
			);
			return formatConnection(row);
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),

	attachSource: organizationPermissionProcedure({
		availability: ["create"],
	}).calendar.attachSource.handler(async ({ context, input }) => {
		try {
			const row = await attachCalendarSourceToListing(
				{
					listingId: input.listingId,
					organizationId: context.activeMembership.organizationId,
					sourceId: input.sourceId,
					createdByUserId: context.session?.user?.id,
				},
				db,
				{
					actorUserId: context.session?.user?.id ?? undefined,
					eventBus: context.eventBus,
				},
			);
			return formatConnection(row);
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),

	disable: organizationPermissionProcedure({
		availability: ["update"],
	}).calendar.disable.handler(async ({ context, input }) => {
		try {
			const row = await disableCalendarConnection(
				input.connectionId,
				context.activeMembership.organizationId,
				db,
				{
					actorUserId: context.session?.user?.id ?? undefined,
					eventBus: context.eventBus,
				},
			);
			return formatConnection(row);
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),

	enable: organizationPermissionProcedure({
		availability: ["update"],
	}).calendar.enable.handler(async ({ context, input }) => {
		try {
			const row = await enableCalendarConnection(
				input.connectionId,
				context.activeMembership.organizationId,
				db,
				{
					actorUserId: context.session?.user?.id ?? undefined,
					eventBus: context.eventBus,
				},
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
				{
					actorUserId: context.session?.user?.id ?? undefined,
					eventBus: context.eventBus,
				},
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

	getWorkspaceState: organizationPermissionProcedure({
		availability: ["read"],
	}).calendar.getWorkspaceState.handler(async ({ context, input }) => {
		try {
			const state = await getCalendarWorkspaceState(
				input.listingId,
				context.activeMembership.organizationId,
				db,
			);
			return {
				...state,
				accounts: state.accounts.map(formatAccount),
				sources: state.sources.map(formatSource),
				connections: state.connections.map(formatConnection),
			};
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),

	getOrgWorkspaceState: organizationPermissionProcedure({
		availability: ["read"],
	}).calendar.getOrgWorkspaceState.handler(async ({ context }) => {
		const state = await getOrgCalendarWorkspaceState(
			context.activeMembership.organizationId,
			db,
		);
		return {
			accounts: state.accounts.map(formatAccount),
			sources: state.sources.map(formatSource),
			connections: state.connections.map((c) => ({
				...formatConnection(c),
				listingName: c.listingName,
			})),
		};
	}),

	setSourceVisibility: organizationPermissionProcedure({
		availability: ["update"],
	}).calendar.setSourceVisibility.handler(async ({ context, input }) => {
		try {
			const row = await setSourceVisibility(
				input.sourceId,
				context.activeMembership.organizationId,
				input.isHidden,
				db,
			);
			return formatSource(row);
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw error;
		}
	}),
};
