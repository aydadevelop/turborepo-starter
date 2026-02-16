import { createContext } from "@full-stack-cf-app/api/context";
import { appRouter } from "@full-stack-cf-app/api/routers/index";
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
	console.error(error);
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
						name: "Boats",
						description: "Boat CRUD — create, list, update, archive",
					},
					{
						name: "Docks",
						description: "Dock management for boats",
					},
					{
						name: "Amenities",
						description: "Boat amenity listings and replacement",
					},
					{
						name: "Assets",
						description: "Media and file assets attached to boats",
					},
					{
						name: "Calendar",
						description: "Calendar connection sync and management",
					},
					{
						name: "Availability",
						description: "Weekly availability rules and date-specific blocks",
					},
					{
						name: "Pricing",
						description: "Pricing profiles and conditional pricing rules",
					},
					{
						name: "Min Duration",
						description: "Minimum booking duration rules per time slot",
					},
					{
						name: "Booking",
						description:
							"Booking CRUD — list, get, create, and cancel managed bookings",
					},
					{
						name: "Storefront",
						description:
							"Public storefront — availability search, quotes, checkout, and booking creation",
					},
					{
						name: "Affiliate",
						description: "Affiliate booking attribution and payout management",
					},
					{
						name: "Cancellation",
						description: "Cancellation request submission, listing, and review",
					},
					{
						name: "Dispute",
						description: "Booking dispute creation, listing, and resolution",
					},
					{
						name: "Refund",
						description: "Refund request submission, review, and processing",
					},
					{
						name: "Shift",
						description: "Booking shift (reschedule) requests and review",
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
				"x-tagGroups": [
					{
						name: "System",
						tags: ["System"],
					},
					{
						name: "Boat Management",
						tags: [
							"Boats",
							"Docks",
							"Amenities",
							"Assets",
							"Calendar",
							"Availability",
							"Pricing",
							"Min Duration",
						],
					},
					{
						name: "Bookings & Payments",
						tags: [
							"Booking",
							"Storefront",
							"Affiliate",
							"Cancellation",
							"Dispute",
							"Refund",
							"Shift",
							"Payment",
							"Discount",
						],
					},
					{
						name: "Support",
						tags: ["Helpdesk", "Intake"],
					},
					{
						name: "Communication",
						tags: ["Notifications", "Telegram"],
					},
					{
						name: "Misc",
						tags: ["Todo"],
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
