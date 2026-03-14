import { listing } from "@my-app/db/schema/marketplace";
import { eq } from "drizzle-orm";
import type { CalendarWorkspaceState, Db } from "./types";
import {
	listAllOrgConnections,
	listCalendarConnections,
	listOrganizationCalendarAccounts,
	listOrganizationCalendarSources,
} from "./use-cases";

export async function getCalendarWorkspaceState(
	listingId: string,
	organizationId: string,
	db: Db,
): Promise<CalendarWorkspaceState> {
	const accounts = await listOrganizationCalendarAccounts(organizationId, db);
	const sources = await listOrganizationCalendarSources(organizationId, db);
	const connections = await listCalendarConnections(
		listingId,
		organizationId,
		db,
	);
	const activeConnections = connections.filter(
		(connection) => connection.isActive,
	);
	const connectedAccounts = accounts.filter(
		(account) => account.status === "connected",
	);
	const activeSources = sources.filter((source) => source.isActive);

	return {
		accounts,
		accountCount: accounts.length,
		connectedAccountCount: connectedAccounts.length,
		sources,
		sourceCount: sources.length,
		activeSourceCount: activeSources.length,
		connections,
		activeConnectionCount: activeConnections.length,
		hasConnectedCalendar: activeConnections.some(
			(connection) => connection.externalCalendarId !== null,
		),
		providers: [
			...new Set(activeConnections.map((connection) => connection.provider)),
		],
	};
}

export interface OrgCalendarWorkspaceState {
	accounts: Awaited<ReturnType<typeof listOrganizationCalendarAccounts>>;
	connections: Array<
		Awaited<ReturnType<typeof listAllOrgConnections>>[number] & {
			listingName: string | null;
		}
	>;
	sources: Awaited<ReturnType<typeof listOrganizationCalendarSources>>;
}

export async function getOrgCalendarWorkspaceState(
	organizationId: string,
	db: Db,
): Promise<OrgCalendarWorkspaceState> {
	const accounts = await listOrganizationCalendarAccounts(organizationId, db);
	const sources = await listOrganizationCalendarSources(organizationId, db);
	const allConnections = await listAllOrgConnections(organizationId, db);
	const connections = allConnections.filter((c) => c.isActive);

	// Batch-load listing names for connections
	const listingIds = [...new Set(connections.map((c) => c.listingId))];
	const listingNameMap = new Map<string, string>();
	if (listingIds.length > 0) {
		for (const id of listingIds) {
			const [row] = await db
				.select({ id: listing.id, name: listing.name })
				.from(listing)
				.where(eq(listing.id, id))
				.limit(1);
			if (row) {
				listingNameMap.set(row.id, row.name);
			}
		}
	}

	return {
		accounts,
		sources,
		connections: connections.map((c) => ({
			...c,
			listingName: listingNameMap.get(c.listingId) ?? null,
		})),
	};
}
