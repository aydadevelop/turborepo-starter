import type { AppRouterClient } from "@full-stack-cf-app/api/routers";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import { createGetBoatDetailsTool } from "./tools/get-boat-details";
import { createGetBookingQuoteTool } from "./tools/get-booking-quote";
import { createSearchAvailableBoatsTool } from "./tools/search-available-boats";
import { createWhoAmITool } from "./tools/whoami";

const createServerClient = (params: {
	serverUrl: string;
	requestHeaders: Headers;
}): AppRouterClient => {
	const cookie = params.requestHeaders.get("cookie") ?? "";
	const activeOrgId =
		params.requestHeaders.get("x-active-organization-id") ?? "";

	const link = new RPCLink({
		url: `${params.serverUrl}/rpc`,
		headers: () => {
			const headers: Record<string, string> = {};

			if (cookie) {
				headers.cookie = cookie;
			}

			if (activeOrgId) {
				headers["x-active-organization-id"] = activeOrgId;
			}

			return headers;
		},
	});

	return createORPCClient(link);
};

export const createAssistantTools = (params: {
	serverUrl: string;
	requestHeaders: Headers;
}) => {
	const client = createServerClient(params);

	return {
		searchAvailableBoats: createSearchAvailableBoatsTool(client),
		getBoatDetails: createGetBoatDetailsTool(client),
		getBookingQuote: createGetBookingQuoteTool(client),
		whoami: createWhoAmITool(client),
	};
};
