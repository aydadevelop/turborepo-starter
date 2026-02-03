import { PUBLIC_SERVER_URL } from "$env/static/public";
import { polarClient } from "@polar-sh/better-auth";
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({
  baseURL: PUBLIC_SERVER_URL,
  plugins: [polarClient()],
});
