import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createMockChargeNotificationTool = (client: AppRouterClient) =>
	tool({
		description:
			"Emit a mock payment success notification event for the active organization.",
		inputSchema: z.object({
			amountCents: z.number().int().positive().max(10_000_000),
			currency: z.string().trim().min(3).max(8).default("USD"),
			description: z.string().trim().min(1).max(200),
		}),
		execute: async (input) => {
			const result = await client.payments.createMockChargeNotification(input);
			return result;
		},
	});
