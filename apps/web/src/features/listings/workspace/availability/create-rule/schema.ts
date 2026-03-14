import { z } from "zod";

const timeString = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM time format.");

function parseMinute(time: string): number {
	const [hours, minutes] = time
		.split(":")
		.map((part) => Number.parseInt(part, 10));
	return hours * 60 + minutes;
}

export const createAvailabilityRuleSchema = z
	.object({
		dayOfWeek: z.string().regex(/^[0-6]$/, "Select a valid day of the week."),
		startTime: timeString,
		endTime: timeString,
	})
	.superRefine((value, ctx) => {
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
