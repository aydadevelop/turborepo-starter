/**
 * Server-side oRPC client — uses the internal Docker network URL.
 * Import this only in .server.ts files (+page.server.ts, +layout.server.ts, hooks.server.ts).
 * For browser-side calls, use `client` from `$lib/orpc.ts` instead.
 */
import type { AppContractClient } from "@my-app/api-contract/routers";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { env } from "$env/dynamic/private";

const serverUrl = env.INTERNAL_SERVER_URL ?? "http://localhost:3000";

const link = new RPCLink({
	url: `${serverUrl}/rpc`,
});

export const serverClient: AppContractClient = createORPCClient(link);
