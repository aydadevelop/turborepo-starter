import type { AppContractClient } from "@my-app/api-contract/routers";
import type { AssistantContext } from "@my-app/assistant/context";
import { assistantRouter } from "@my-app/assistant/router";
import { auth } from "@my-app/auth";
import { env } from "@my-app/env/assistant";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { MiddlewareHandler } from "hono";

const logServerError = (error: unknown) => {
	console.error(error);
};

const rpcHandler = new RPCHandler(assistantRouter, {
	interceptors: [onError(logServerError)],
});

const createServerClient = (
	cookie: string,
	fetchFn: typeof fetch,
): AppContractClient => {
	const link = new RPCLink({
		url: `${env.SERVER_URL}/rpc`,
		fetch(request, init) {
			const forwarded = new Request(request, init);
			if (cookie) {
				forwarded.headers.set("cookie", cookie);
			}
			return fetchFn(forwarded);
		},
	});

	return createORPCClient(link);
};

export const rpcMiddleware: MiddlewareHandler = async (c, next) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	const cookie = c.req.raw.headers.get("cookie") ?? "";

	const context: AssistantContext = {
		session,
		openRouterApiKey: env.OPEN_ROUTER_API_KEY,
		aiModel: env.AI_MODEL,
		serverClient: createServerClient(cookie, fetch),
	};

	const result = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context,
	});

	if (result.matched) {
		return c.newResponse(result.response.body, result.response);
	}

	await next();
};
