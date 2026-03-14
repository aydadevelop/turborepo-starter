import { organizationCalendarAccount } from "@my-app/db/schema/availability";
import { eq } from "drizzle-orm";
import type {
	CalendarAccountRow,
	CalendarConnectionConfig,
	CalendarConnectionRow,
	Db,
} from "./types";

export const getAccountCredentials = (
	account: Pick<CalendarAccountRow, "providerMetadata"> | null | undefined,
): Record<string, unknown> => {
	const metadata = account?.providerMetadata;
	if (!metadata || typeof metadata !== "object") {
		return {};
	}

	const credentials = (metadata as { credentials?: unknown }).credentials;
	if (credentials && typeof credentials === "object") {
		return credentials as Record<string, unknown>;
	}

	return metadata as Record<string, unknown>;
};

export const getConnectionConfig = async (
	connection: Pick<
		CalendarConnectionRow,
		"calendarAccountId" | "externalCalendarId" | "provider"
	>,
	db: Db,
): Promise<CalendarConnectionConfig> => {
	if (!connection.externalCalendarId) {
		throw new Error("CALENDAR_CONNECTION_NO_EXTERNAL_ID");
	}

	let credentials: Record<string, unknown> = {};
	if (connection.calendarAccountId) {
		const [account] = await db
			.select()
			.from(organizationCalendarAccount)
			.where(eq(organizationCalendarAccount.id, connection.calendarAccountId))
			.limit(1);
		credentials = getAccountCredentials(account);
	}

	return {
		provider: connection.provider,
		credentials,
		calendarId: connection.externalCalendarId,
	};
};