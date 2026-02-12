import { createContext } from "@full-stack-cf-app/api/context";
import { appRouter } from "@full-stack-cf-app/api/routers/index";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { MiddlewareHandler } from "hono";

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
						title: "Boat Booking API",
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
					title: "Boat Booking API",
					version: "1.0.0",
					description:
						"API for managing boat rentals, bookings, pricing, and customer support.",
				},
				servers: [{ url: request.url.origin }],
				tags: [
					{
						name: "System",
						description: "Health checks and access control",
					},
					{
						name: "Boat",
						description:
							"Boat CRUD, docks, amenities, assets, calendar connections, availability, and pricing",
					},
					{
						name: "Booking",
						description:
							"Booking creation, listing, availability search, and quotes",
					},
					{
						name: "Booking Lifecycle",
						description:
							"Cancellation requests, disputes, and refund workflows",
					},
					{
						name: "Payment",
						description: "Payment attempts and processing",
					},
					{
						name: "Discount",
						description: "Discount code management",
					},
					{
						name: "Helpdesk",
						description: "Support tickets and messages",
					},
					{
						name: "Intake",
						description: "Inbound message ingestion and processing",
					},
					{
						name: "Notifications",
						description: "In-app notifications and real-time streams",
					},
					{
						name: "Telegram",
						description: "Telegram notifications and webhook events",
					},
					{
						name: "Todo",
						description: "Todo list management",
					},
				],
			}),
		}),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
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
