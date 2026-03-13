import { passkeyClient } from "@better-auth/passkey/client";
import {
	adminClient,
	anonymousClient,
	organizationClient,
	phoneNumberClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";
import { telegramClient } from "better-auth-telegram/client";
import { resolveServerPath } from "./server-url";

export const authClient = createAuthClient({
	baseURL: resolveServerPath("/api/auth"),
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
