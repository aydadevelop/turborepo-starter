import { z } from "zod";

function parseMinute(time: string): number {
	const [hours, minutes] = time
		.split(":")
		.map((part) => Number.parseInt(part, 10));
	return hours * 60 + minutes;
}

export const createAvailabilityExceptionSchema = z
	.object({
		date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid date."),
		isAvailable: z.boolean(),
		startTime: z.string(),
		endTime: z.string(),
		reason: z.string(),
	})
	.superRefine((value, ctx) => {
		if (!value.isAvailable) {
			return;
		}

		if (!(value.startTime && value.endTime)) {
			ctx.addIssue({
				code: "custom",
				path: ["startTime"],
				message:
					"Provide both start and end times for a partial-day available exception.",
			});
			return;
		}

		const startMinute = parseMinute(value.startTime);
		const endMinute = parseMinute(value.endTime);
		if (endMinute <= startMinute) {
			ctx.addIssue({
				code: "custom",
				path: ["endTime"],
				message: "End time must be later than start time.",
			});
		}
	});
