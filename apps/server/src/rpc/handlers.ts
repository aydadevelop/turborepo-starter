import { createContext } from "@my-app/api/context";
import { appRouter } from "@my-app/api/handlers/index";
import { log } from "@my-app/telemetry";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { MiddlewareHandler } from "hono";

const logServerError = (error: unknown) => {
	if (error instanceof ORPCError && error.status < 500) {
		return;
	}
	log.error("oRPC handler error", {
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
	});
};

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
			renderDocsHtml: (_specUrl, title) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', ${JSON.stringify({
				sources: [
					{
						url: "/api-reference/spec.json",
						title: "Starter SaaS API",
					},
					{
						url: "/api/auth/open-api/generate-schema",
						title: "Auth",
					},
				],
			})})
    </script>
  </body>
</html>`,
			specGenerateOptions: ({ request }) => ({
				info: {
					title: "Starter SaaS API",
					version: "1.0.0",
					description:
						"Starter API for auth, organizations, tasks, notifications, payments, and todo flows.",
				},
				servers: [{ url: request.url.origin }],
				tags: [
					{
						name: "System",
						description: "Health checks and access control",
					},
					{
						name: "Admin / Organizations",
						description: "Platform admin organization and user management",
					},
					{
						name: "Notifications",
						description: "In-app notification listing, marking, and streaming",
					},
					{
						name: "Payments",
						description: "Payment provider status and mock charge events",
					},
					{
						name: "Tasks",
						description:
							"Recurring task scheduling with queue-backed reminders",
					},
					{
						name: "Consent",
						description: "User consent status and acceptance",
					},
					{
						name: "Todo",
						description: "Todo list management",
					},
				],
				"x-tagGroups": [
					{
						name: "System",
						tags: ["System"],
					},
					{
						name: "Administration",
						tags: ["Admin / Organizations"],
					},
					{
						name: "SaaS Core",
						tags: ["Payments", "Tasks", "Notifications", "Consent", "Todo"],
					},
				],
			}),
		}),
	],
	interceptors: [onError(logServerError)],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [onError(logServerError)],
});

export const rpcMiddleware: MiddlewareHandler = async (c, next) => {
	const context = await createContext({ context: c });

	const rpcResult = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context,
	});

	if (rpcResult.matched) {
		return c.newResponse(rpcResult.response.body, rpcResult.response);
	}

	const apiResult = await apiHandler.handle(c.req.raw, {
		prefix: "/api-reference",
		context,
	});

	if (apiResult.matched) {
		return c.newResponse(apiResult.response.body, apiResult.response);
	}

	await next();
};
