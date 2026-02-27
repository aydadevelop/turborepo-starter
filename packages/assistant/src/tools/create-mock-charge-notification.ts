import type { AppContractClient } from "@my-app/api-contract/routers";
import z from "zod";
import { orpcMutationTool } from "../lib/orpc-tool";

export const createMockChargeNotificationTool = (client: AppContractClient) =>
	orpcMutationTool(
		z.object({
			amountCents: z.number().int().positive().max(10_000_000),
			currency: z.string().trim().min(3).max(8).default("USD"),
			description: z.string().trim().min(1).max(200),
		}),
		"Emit a mock payment success notification event for the active organization.",
		async (input) => {
			const result = await client.payments.createMockChargeNotification(input);
			return result;
		}
	);
