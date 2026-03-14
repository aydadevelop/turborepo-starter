import { ORPCError } from "@orpc/server";

import { organizationPermissionProcedure } from "../index";
import { scheduleRecurringTask } from "../tasks/recurring";

export const tasksRouter = {
	scheduleRecurringReminder: organizationPermissionProcedure({
		task: ["create"],
		notification: ["create"],
	}).tasks.scheduleRecurringReminder.handler(async ({ context, input }) => {
		const userId = context.session?.user?.id;
		if (!userId) {
			throw new ORPCError("UNAUTHORIZED");
		}

		const taskId = crypto.randomUUID();
		const result = await scheduleRecurringTask(
			{
				taskId,
				organizationId: context.activeMembership.organizationId,
				userId,
				title: input.title,
				body: input.body,
				severity: input.severity,
				initialDelaySeconds: input.initialDelaySeconds,
				intervalSeconds: input.intervalSeconds,
				runCount: input.runCount,
			},
			context.recurringTaskQueue,
		);

		const startsAt = new Date(Date.now() + input.initialDelaySeconds * 1000);

		return {
			taskId,
			queued: result.queued,
			startsAt: startsAt.toISOString(),
			intervalSeconds: input.intervalSeconds,
			runCount: input.runCount,
		};
	}),
};
