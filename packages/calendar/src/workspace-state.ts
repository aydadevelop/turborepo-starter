import type { Db, CalendarWorkspaceState } from "./types";
import {
	listCalendarConnections,
	listOrganizationCalendarAccounts,
	listOrganizationCalendarSources,
} from "./use-cases";

export async function getCalendarWorkspaceState(
	listingId: string,
	organizationId: string,
	db: Db
): Promise<CalendarWorkspaceState> {
	const accounts = await listOrganizationCalendarAccounts(organizationId, db);
	const sources = await listOrganizationCalendarSources(organizationId, db);
	const connections = await listCalendarConnections(listingId, organizationId, db);
	const activeConnections = connections.filter((connection) => connection.isActive);
	const connectedAccounts = accounts.filter(
		(account) => account.status === "connected"
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
			(connection) => connection.externalCalendarId !== null
		),
		hasPrimaryConnection: activeConnections.some((connection) => connection.isPrimary),
		primaryConnectionId:
			activeConnections.find((connection) => connection.isPrimary)?.id ?? null,
		providers: [...new Set(activeConnections.map((connection) => connection.provider))],
	};
}
