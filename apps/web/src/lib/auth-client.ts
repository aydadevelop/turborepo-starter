import { passkeyClient } from "@better-auth/passkey/client";
import { polarClient } from "@polar-sh/better-auth";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";
import { PUBLIC_SERVER_URL } from "$env/static/public";

const serverUrl = PUBLIC_SERVER_URL.replace(/\/+$/, "");

export const authClient = createAuthClient({
	baseURL: serverUrl,
	plugins: [organizationClient(), polarClient(), passkeyClient()],
});
