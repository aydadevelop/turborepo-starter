import z from "zod";

export const recurringTaskTickMessageSchema = z.object({
	kind: z.literal("task.recurring.tick.v1"),
	taskId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
	userId: z.string().trim().min(1),
	title: z.string().trim().min(1).max(200),
	body: z.string().trim().max(1000).optional(),
	severity: z.enum(["info", "success", "warning", "error"]).default("info"),
	intervalSeconds: z.number().int().min(60).max(86_400),
	remainingRuns: z.number().int().min(1).max(100),
	runNumber: z.number().int().min(1).max(100),
});

export type RecurringTaskTickMessage = z.infer<
	typeof recurringTaskTickMessageSchema
>;

export const createRecurringTaskTickMessage = (
	input: RecurringTaskTickMessage
): RecurringTaskTickMessage => {
	return recurringTaskTickMessageSchema.parse(input);
};
