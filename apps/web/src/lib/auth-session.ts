import type { authClient } from "./auth-client";

type SessionData =
	ReturnType<typeof authClient.useSession> extends {
		subscribe: (cb: (v: { data: infer D }) => void) => void;
	}
		? D
		: never;

export function hasAuthenticatedSession(
	data: SessionData | null | undefined
): data is NonNullable<SessionData> & { session: object; user: object } {
	return Boolean(data?.session && data?.user);
}

export function getAuthenticatedUserId(
	data: SessionData | null | undefined
): string | null {
	return (data?.user as { id?: string } | undefined)?.id ?? null;
}
