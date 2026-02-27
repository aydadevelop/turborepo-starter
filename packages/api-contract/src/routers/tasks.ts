import { oc } from "@orpc/contract";
import z from "zod";

const scheduleRecurringTaskInputSchema = z.object({
	title: z.string().trim().min(1).max(200),
	body: z.string().trim().max(1000).optional(),
	severity: z.enum(["info", "success", "warning", "error"]).default("info"),
	initialDelaySeconds: z.number().int().min(0).max(3600).default(0),
	intervalSeconds: z.number().int().min(60).max(86_400).default(3600),
	runCount: z.number().int().min(1).max(100).default(3),
});

const scheduleRecurringTaskOutputSchema = z.object({
	taskId: z.string().trim().min(1),
	queued: z.boolean(),
	startsAt: z.string().datetime(),
	intervalSeconds: z.number().int().min(60),
	runCount: z.number().int().min(1),
});

export const tasksContract = {
	scheduleRecurringReminder: oc
		.route({
			tags: ["Tasks"],
			summary: "Schedule recurring reminder",
			description:
				"Enqueue a recurring in-app reminder that posts to notifications for the current user.",
		})
		.input(scheduleRecurringTaskInputSchema)
		.output(scheduleRecurringTaskOutputSchema),
};
