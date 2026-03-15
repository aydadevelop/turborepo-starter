import type { RequestEvent } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { AuthSessionData } from "./auth-session";

const DEFAULT_SERVER_URL = "http://localhost:3000";
const TRAILING_SLASHES_RE = /\/+$/;

function resolveInternalServerUrl(): string {
	return (
		env.INTERNAL_SERVER_URL ??
		env.PUBLIC_SERVER_URL ??
		DEFAULT_SERVER_URL
	).replace(TRAILING_SLASHES_RE, "");
}

type BetterAuthSessionResponse =
	| (AuthSessionData & { needsRefresh?: boolean })
	| { needsRefresh?: boolean }
	| null;

function hasSessionPayload(
	payload: BetterAuthSessionResponse
): payload is AuthSessionData & { needsRefresh?: boolean } {
	return Boolean(payload && "session" in payload && "user" in payload);
}

export async function getServerSession(
	event: Pick<RequestEvent, "fetch" | "request">
): Promise<AuthSessionData | null> {
	const cookie = event.request.headers.get("cookie");

	try {
		const response = await event.fetch(
			`${resolveInternalServerUrl()}/api/auth/get-session`,
			{
				method: "GET",
				headers: cookie ? { cookie } : undefined,
			}
		);

		if (!response.ok) {
			return null;
		}

		const payload = (await response.json()) as BetterAuthSessionResponse;
		if (hasSessionPayload(payload) && payload.session && payload.user) {
			return {
				session: payload.session,
				user: payload.user,
			};
		}

		return null;
	} catch {
		return null;
	}
}