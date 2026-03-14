import { oc } from "@orpc/contract";
import z from "zod";

const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const availabilityRuleOutput = z.object({
	id: z.string(),
	listingId: z.string(),
	dayOfWeek: z.number().int().min(0).max(6),
	startMinute: z.number().int(),
	endMinute: z.number().int(),
	isActive: z.boolean(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const availabilityBlockOutput = z.object({
	id: z.string(),
	listingId: z.string(),
	source: z.string(),
	startsAt: z.string().datetime(),
	endsAt: z.string().datetime(),
	reason: z.string().nullable(),
	isActive: z.boolean(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const availabilityExceptionOutput = z.object({
	id: z.string(),
	listingId: z.string(),
	date: isoDateString,
	isAvailable: z.boolean(),
	startMinute: z.number().int().nullable(),
	endMinute: z.number().int().nullable(),
	reason: z.string().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const availabilityWorkspaceStateOutput = z.object({
	activeBlockCount: z.number().int(),
	activeRuleCount: z.number().int(),
	blocks: z.array(availabilityBlockOutput),
	exceptionCount: z.number().int(),
	exceptions: z.array(availabilityExceptionOutput),
	hasAvailability: z.boolean(),
	rules: z.array(availabilityRuleOutput),
});

export const availabilityContract = {
	addRule: oc
		.route({
			tags: ["Availability"],
			summary: "Add recurring availability rule",
		})
		.input(
			z.object({
				listingId: z.string(),
				dayOfWeek: z.number().int().min(0).max(6),
				startMinute: z.number().int().min(0).max(1440),
				endMinute: z.number().int().min(1).max(1440),
			})
		)
		.output(availabilityRuleOutput),

	deleteRule: oc
		.route({ tags: ["Availability"], summary: "Delete availability rule" })
		.input(z.object({ id: z.string() }))
		.output(z.object({ success: z.boolean() })),

	listRules: oc
		.route({ tags: ["Availability"], summary: "List availability rules" })
		.input(z.object({ listingId: z.string() }))
		.output(z.array(availabilityRuleOutput)),

	getWorkspaceState: oc
		.route({
			tags: ["Availability"],
			summary: "Get availability workspace state",
		})
		.input(z.object({ listingId: z.string() }))
		.output(availabilityWorkspaceStateOutput),

	addBlock: oc
		.route({ tags: ["Availability"], summary: "Add availability block" })
		.input(
			z.object({
				listingId: z.string(),
				startsAt: z.string().datetime(),
				endsAt: z.string().datetime(),
				reason: z.string().optional(),
			})
		)
		.output(availabilityBlockOutput),

	deleteBlock: oc
		.route({ tags: ["Availability"], summary: "Delete availability block" })
		.input(z.object({ id: z.string() }))
		.output(z.object({ success: z.boolean() })),

	addException: oc
		.route({ tags: ["Availability"], summary: "Add availability exception" })
		.input(
			z.object({
				listingId: z.string(),
				date: isoDateString,
				isAvailable: z.boolean(),
				startMinute: z.number().int().optional(),
				endMinute: z.number().int().optional(),
				reason: z.string().optional(),
			})
		)
		.output(availabilityExceptionOutput),

	deleteException: oc
		.route({ tags: ["Availability"], summary: "Delete availability exception" })
		.input(z.object({ id: z.string() }))
		.output(z.object({ success: z.boolean() })),

	checkSlot: oc
		.route({ tags: ["Availability"], summary: "Check slot availability" })
		.input(
			z.object({
				listingId: z.string(),
				startsAt: z.string().datetime(),
				endsAt: z.string().datetime(),
			})
		)
		.output(z.object({ available: z.boolean() })),
};
