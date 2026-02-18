import type { AppRouterClient } from "@full-stack-cf-app/api/routers";

import { createGetBoatDetailsTool } from "./tools/get-boat-details";
import { createGetBookingQuoteTool } from "./tools/get-booking-quote";
import { createSearchAvailableBoatsTool } from "./tools/search-available-boats";
import { createWhoAmITool } from "./tools/whoami";

export const createAssistantTools = (client: AppRouterClient) => {
	return {
		searchAvailableBoats: createSearchAvailableBoatsTool(client),
		getBoatDetails: createGetBoatDetailsTool(client),
		getBookingQuote: createGetBookingQuoteTool(client),
		whoami: createWhoAmITool(client),
	};
};
