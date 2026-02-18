import type { AssistantContext } from "@full-stack-cf-app/assistant/context";
import { assistantRouter } from "@full-stack-cf-app/assistant/router";
import { auth } from "@full-stack-cf-app/auth";
import { env } from "@full-stack-cf-app/env/assistant";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { MiddlewareHandler } from "hono";

const logServerError = (error: unknown) => {
	console.error(error);
};

const rpcHandler = new RPCHandler(assistantRouter, {
	interceptors: [onError(logServerError)],
});

export const rpcMiddleware: MiddlewareHandler = async (c, next) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	const context: AssistantContext = {
		session,
		requestHeaders: c.req.raw.headers,
		openRouterApiKey: env.OPEN_ROUTER_API_KEY,
		aiModel: env.AI_MODEL,
		serverUrl: env.BETTER_AUTH_URL,
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
