/**
 * Server-side assistant client — uses the internal Docker network URL.
 * Import this only in .server.ts files (+page.server.ts, +layout.server.ts, hooks.server.ts).
 * For browser-side calls, use `assistantClient` from `$lib/assistant.ts` instead.
 */
import type { AssistantContractClient } from "@my-app/assistant/contract";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { env } from "$env/dynamic/private";

const assistantUrl = env.INTERNAL_ASSISTANT_URL ?? "http://localhost:3001";

const link = new RPCLink({
	url: `${assistantUrl}/rpc`,
});

export const assistantServerClient: AssistantContractClient =
	createORPCClient(link);
