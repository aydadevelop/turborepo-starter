import { randomUUID } from "node:crypto";
import { db } from "@my-app/db";
import { account, user } from "@my-app/db/schema/auth";
import { contaktlyCalendarConnection } from "@my-app/db/schema/contaktly";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";

export const contaktlyGoogleCalendarStatusValues = [
	"not_linked",
	"missing_scope",
	"linked_account",
	"connected",
] as const;

export type ContaktlyGoogleCalendarStatus =
	(typeof contaktlyGoogleCalendarStatusValues)[number];

export interface ContaktlyGoogleCalendarConnectionStatus {
	accountEmail: string | null;
	calendarId: string | null;
	configId: string;
	connectedAt: string | null;
	provider: "google";
	scopes: string[];
	status: ContaktlyGoogleCalendarStatus;
}

const GOOGLE_CALENDAR_SCOPE_PREFIX = "https://www.googleapis.com/auth/calendar";
const STORED_SCOPE_SPLIT_RE = /[,\s]+/;

const parseStoredScopes = (value: string | null | undefined): string[] =>
	(value ?? "")
		.split(STORED_SCOPE_SPLIT_RE)
		.map((scope) => scope.trim())
		.filter(Boolean);

const hasCalendarScope = (scopes: string[]): boolean =>
	scopes.some(
		(scope) =>
			scope === GOOGLE_CALENDAR_SCOPE_PREFIX ||
			scope.startsWith(`${GOOGLE_CALENDAR_SCOPE_PREFIX}.`)
	);

const getPersistedConnection = async (configId: string) => {
	const [stored] = await db
		.select()
		.from(contaktlyCalendarConnection)
		.where(eq(contaktlyCalendarConnection.publicConfigId, configId))
		.limit(1);

	return stored ?? null;
};

const getLatestGoogleAccountForUser = async (userId: string) => {
	const [googleAccount] = await db
		.select({
			accountEmail: user.email,
			providerAccountId: account.accountId,
			scopes: account.scope,
		})
		.from(account)
		.innerJoin(user, eq(user.id, account.userId))
		.where(and(eq(account.userId, userId), eq(account.providerId, "google")))
		.orderBy(desc(account.updatedAt), desc(account.createdAt))
		.limit(1);

	if (!googleAccount) {
		return null;
	}

	return {
		accountEmail: googleAccount.accountEmail,
		providerAccountId: googleAccount.providerAccountId,
		scopes: parseStoredScopes(googleAccount.scopes),
	};
};

const buildStatus = ({
	accountEmail,
	calendarId,
	configId,
	connectedAt,
	scopes,
	status,
}: Omit<ContaktlyGoogleCalendarConnectionStatus, "provider">) => ({
	accountEmail,
	calendarId,
	configId,
	connectedAt,
	provider: "google" as const,
	scopes,
	status,
});

export const getContaktlyGoogleCalendarConnectionStatus = async ({
	configId,
	userId,
}: {
	configId: string;
	userId: string;
}): Promise<ContaktlyGoogleCalendarConnectionStatus> => {
	const persistedConnection = await getPersistedConnection(configId);

	if (persistedConnection) {
		return buildStatus({
			configId,
			status: "connected",
			accountEmail: persistedConnection.accountEmail,
			calendarId: persistedConnection.calendarId,
			scopes: persistedConnection.scopes,
			connectedAt: persistedConnection.updatedAt.toISOString(),
		});
	}

	const linkedGoogleAccount = await getLatestGoogleAccountForUser(userId);

	if (!linkedGoogleAccount) {
		return buildStatus({
			configId,
			status: "not_linked",
			accountEmail: null,
			calendarId: null,
			scopes: [],
			connectedAt: null,
		});
	}

	if (!hasCalendarScope(linkedGoogleAccount.scopes)) {
		return buildStatus({
			configId,
			status: "missing_scope",
			accountEmail: linkedGoogleAccount.accountEmail,
			calendarId: null,
			scopes: linkedGoogleAccount.scopes,
			connectedAt: null,
		});
	}

	return buildStatus({
		configId,
		status: "linked_account",
		accountEmail: linkedGoogleAccount.accountEmail,
		calendarId: null,
		scopes: linkedGoogleAccount.scopes,
		connectedAt: null,
	});
};

export const connectContaktlyGoogleCalendar = async ({
	configId,
	userId,
}: {
	configId: string;
	userId: string;
}): Promise<ContaktlyGoogleCalendarConnectionStatus> => {
	const linkedGoogleAccount = await getLatestGoogleAccountForUser(userId);

	if (!linkedGoogleAccount) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Link a Google account before connecting calendar access.",
		});
	}

	if (!hasCalendarScope(linkedGoogleAccount.scopes)) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"Google account is linked but calendar permissions are missing. Re-run OAuth with calendar scopes.",
		});
	}

	await db
		.insert(contaktlyCalendarConnection)
		.values({
			id: randomUUID(),
			publicConfigId: configId,
			provider: "google",
			providerAccountId: linkedGoogleAccount.providerAccountId,
			connectedUserId: userId,
			accountEmail: linkedGoogleAccount.accountEmail,
			calendarId: "primary",
			scopes: linkedGoogleAccount.scopes,
		})
		.onConflictDoUpdate({
			target: contaktlyCalendarConnection.publicConfigId,
			set: {
				provider: "google",
				providerAccountId: linkedGoogleAccount.providerAccountId,
				connectedUserId: userId,
				accountEmail: linkedGoogleAccount.accountEmail,
				calendarId: "primary",
				scopes: linkedGoogleAccount.scopes,
				updatedAt: new Date(),
			},
		});

	return await getContaktlyGoogleCalendarConnectionStatus({
		configId,
		userId,
	});
};
