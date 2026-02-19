import type { AppRouterClient } from "@full-stack-cf-app/api/routers";
import type { AssistantContext } from "@full-stack-cf-app/assistant/context";
import { assistantRouter } from "@full-stack-cf-app/assistant/router";
import { auth } from "@full-stack-cf-app/auth";
import { env } from "@full-stack-cf-app/env/assistant";
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
	fetchFn: typeof fetch
): AppRouterClient => {
	const link = new RPCLink({
		url: `${env.BETTER_AUTH_URL}/rpc`,
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

	const serverWorker = env.SERVER_WORKER as { fetch: typeof fetch } | undefined;
	const cookie = c.req.raw.headers.get("cookie") ?? "";
	const fetchFn = serverWorker ? serverWorker.fetch.bind(serverWorker) : fetch;

	const context: AssistantContext = {
		session,
		openRouterApiKey: env.OPEN_ROUTER_API_KEY,
		aiModel: env.AI_MODEL,
		serverClient: createServerClient(cookie, fetchFn),
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
