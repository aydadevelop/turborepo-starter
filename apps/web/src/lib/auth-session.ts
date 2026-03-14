import type { authClient } from "./auth-client";

type SessionData = typeof authClient.$Infer.Session;

const isAnonymousUser = (
	user: SessionData["user"] | null | undefined,
): boolean => Boolean(user?.isAnonymous);

export function hasSessionUser(
	data: SessionData | null | undefined,
): data is NonNullable<SessionData> & {
	session: object;
	user: { id: string };
} {
	return Boolean(data?.session && data?.user?.id);
}

export function hasAuthenticatedSession(
	data: SessionData | null | undefined,
): data is NonNullable<SessionData> & {
	session: object;
	user: { id: string };
} {
	if (!hasSessionUser(data)) {
		return false;
	}

	return !isAnonymousUser(data.user);
}

export function getSessionUserId(
	data: SessionData | null | undefined,
): string | null {
	return hasSessionUser(data) ? data.user.id : null;
}

export function getAuthenticatedUserId(
	data: SessionData | null | undefined,
): string | null {
	if (!hasSessionUser(data) || isAnonymousUser(data.user)) {
		return null;
	}

	return data.user.id;
}
