import type { authClient } from "./auth-client";

type SessionData = typeof authClient.$Infer.Session;

const isAnonymousUser = (
	user: SessionData["user"] | null | undefined
): boolean => Boolean(user?.isAnonymous);

export function hasAuthenticatedSession(
	data: SessionData | null | undefined
): data is NonNullable<SessionData> & {
	session: object;
	user: { id: string };
} {
	const user = data?.user;
	if (!(data?.session && user?.id)) {
		return false;
	}

	return !isAnonymousUser(user);
}

export function getAuthenticatedUserId(
	data: SessionData | null | undefined
): string | null {
	const user = data?.user;
	if (!user?.id || isAnonymousUser(user)) {
		return null;
	}

	return user.id;
}
