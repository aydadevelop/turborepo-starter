import { authClient } from "./auth-client";

export type AuthSessionData = typeof authClient.$Infer.Session;
export type AuthSessionStoreState = ReturnType<
	typeof authClient.useSession
> extends {
	get(): infer T;
}
	? T
	: never;

type SessionData = AuthSessionData;

type SessionStoreAtom = {
	get(): AuthSessionStoreState;
	set(value: AuthSessionStoreState): void;
};

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

export function getPageInitialSessionData(
	pageData: unknown,
): AuthSessionData | null | undefined {
	return (pageData as { initialSession?: AuthSessionData | null } | undefined)
		?.initialSession;
}

export function resolveSessionData(
	queryState: AuthSessionStoreState,
	initialData: AuthSessionData | null | undefined,
): AuthSessionData | null {
	return queryState.data ?? initialData ?? null;
}

export function isSessionPending(
	queryState: AuthSessionStoreState,
	initialData: AuthSessionData | null | undefined,
): boolean {
	return queryState.isPending && initialData === undefined;
}

export function hydrateSessionStore(
	initialData: AuthSessionData | null | undefined,
): void {
	if (typeof window === "undefined" || initialData === undefined) {
		return;
	}

	const sessionAtom = authClient.$store.atoms.session as SessionStoreAtom;
	const current = sessionAtom.get();
	if (!current.isPending) {
		return;
	}

	sessionAtom.set({
		...current,
		data: initialData,
		error: null,
		isPending: false,
		isRefetching: false,
	});
}
