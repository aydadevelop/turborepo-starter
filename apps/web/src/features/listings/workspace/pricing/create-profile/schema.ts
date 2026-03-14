import { z } from "zod";

const NON_NEGATIVE_INTEGER_RE = /^\d+$/;
const POSITIVE_INTEGER_RE = /^[1-9]\d*$/;

const nonNegativeIntegerString = (message: string) =>
	z.string().trim().regex(NON_NEGATIVE_INTEGER_RE, message);

const positiveIntegerString = (message: string) =>
	z.string().trim().regex(POSITIVE_INTEGER_RE, message);

export const createPricingProfileSchema = z.object({
	name: z.string().trim().min(1, "Profile name is required.").max(120),
	currency: z
		.string()
		.trim()
		.length(3, "Currency must be a 3-letter code.")
		.transform((value) => value.toUpperCase()),
	baseHourlyPriceCents: positiveIntegerString(
		"Base hourly price must be a positive whole number."
	),
	minimumHours: positiveIntegerString(
		"Minimum hours must be a positive whole number."
	),
	serviceFeeBps: nonNegativeIntegerString(
		"Service fee must be a non-negative whole number."
	),
	taxBps: nonNegativeIntegerString("Tax must be a non-negative whole number."),
	isDefault: z.boolean(),
});
