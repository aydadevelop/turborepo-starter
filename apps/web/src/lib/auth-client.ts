import { passkeyClient } from "@better-auth/passkey/client";
import {
	adminClient,
	anonymousClient,
	organizationClient,
	phoneNumberClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";
import { telegramClient } from "better-auth-telegram/client";
import { PUBLIC_SERVER_URL } from "$env/static/public";

const TRAILING_SLASHES = /\/+$/;
const ABSOLUTE_URL = /^https?:\/\//;

function resolveServerUrl(): string {
	const raw = PUBLIC_SERVER_URL.replace(TRAILING_SLASHES, "");
	if (ABSOLUTE_URL.test(raw)) {
		return raw;
	}
	const origin =
		typeof window !== "undefined" ? window.location.origin : "http://localhost";
	return `${origin}${raw}`;
}

export const authClient = createAuthClient({
	baseURL: `${resolveServerUrl()}/api/auth`,
	basePath: "/",
	plugins: [
		adminClient(),
		anonymousClient(),
		organizationClient(),
		passkeyClient(),
		phoneNumberClient(),
		telegramClient(),
	],
});
