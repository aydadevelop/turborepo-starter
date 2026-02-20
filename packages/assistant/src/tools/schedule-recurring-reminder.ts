import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createScheduleRecurringReminderTool = (client: AppRouterClient) =>
	tool({
		description:
			"Schedule a recurring in-app reminder for the signed-in user in the active organization.",
		inputSchema: z.object({
			title: z.string().trim().min(1).max(200),
			body: z.string().trim().max(1000).optional(),
			intervalSeconds: z.number().int().min(60).max(86_400).default(3600),
			runCount: z.number().int().min(1).max(100).default(3),
			initialDelaySeconds: z.number().int().min(0).max(3600).default(0),
			severity: z.enum(["info", "success", "warning", "error"]).default("info"),
		}),
		execute: async (input) => {
			const result = await client.tasks.scheduleRecurringReminder(input);
			return result;
		},
	});
