import { z } from "zod";

export const createAvailabilityBlockSchema = z
	.object({
		startsAt: z.string().trim().min(1, "Start time is required."),
		endsAt: z.string().trim().min(1, "End time is required."),
		reason: z.string(),
	})
	.superRefine((value, ctx) => {
		const startsAt = new Date(value.startsAt);
		const endsAt = new Date(value.endsAt);
		if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
			ctx.addIssue({
				code: "custom",
				path: ["startsAt"],
				message: "Provide valid date and time values.",
			});
			return;
		}

		if (endsAt <= startsAt) {
			ctx.addIssue({
				code: "custom",
				path: ["endsAt"],
				message: "End time must be later than start time.",
			});
		}
	});
