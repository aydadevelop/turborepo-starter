import { oc } from "@orpc/contract";
import z from "zod";

const pricingProfileOutput = z.object({
	id: z.string(),
	listingId: z.string(),
	name: z.string(),
	currency: z.string(),
	baseHourlyPriceCents: z.number().int(),
	minimumHours: z.number().int(),
	serviceFeeBps: z.number().int(),
	taxBps: z.number().int(),
	isDefault: z.boolean(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const pricingRuleOutput = z.object({
	id: z.string(),
	listingId: z.string(),
	pricingProfileId: z.string(),
	name: z.string(),
	ruleType: z.string(),
	conditionJson: z.record(z.string(), z.unknown()),
	adjustmentType: z.string(),
	adjustmentValue: z.number().int(),
	priority: z.number().int(),
	isActive: z.boolean(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const quoteBreakdownOutput = z.object({
	listingId: z.string(),
	profileId: z.string(),
	currency: z.string(),
	durationMinutes: z.number(),
	baseCents: z.number().int(),
	adjustmentCents: z.number().int(),
	serviceFeeCents: z.number().int(),
	taxCents: z.number().int(),
	totalCents: z.number().int(),
});

const pricingWorkspaceStateOutput = z.object({
	currencies: z.array(z.string()),
	defaultProfileId: z.string().nullable(),
	hasPricing: z.boolean(),
	profileRuleSummaries: z.array(
		z.object({
			profileId: z.string(),
			totalRuleCount: z.number().int(),
			activeRuleCount: z.number().int(),
		}),
	),
	profiles: z.array(pricingProfileOutput),
	totalActiveRuleCount: z.number().int(),
	totalRuleCount: z.number().int(),
});

export const pricingContract = {
	createProfile: oc
		.route({ tags: ["Pricing"], summary: "Create pricing profile" })
		.input(
			z.object({
				listingId: z.string(),
				name: z.string().min(1),
				currency: z.string().length(3),
				baseHourlyPriceCents: z.number().int().positive(),
				minimumHours: z.number().int().min(1).optional(),
				serviceFeeBps: z.number().int().min(0).optional(),
				taxBps: z.number().int().min(0).optional(),
				isDefault: z.boolean().optional(),
			}),
		)
		.output(pricingProfileOutput),

	updateProfile: oc
		.route({ tags: ["Pricing"], summary: "Update pricing profile" })
		.input(
			z.object({
				id: z.string(),
				name: z.string().min(1).optional(),
				baseHourlyPriceCents: z.number().int().positive().optional(),
				serviceFeeBps: z.number().int().min(0).optional(),
				taxBps: z.number().int().min(0).optional(),
				isDefault: z.boolean().optional(),
			}),
		)
		.output(pricingProfileOutput),

	listProfiles: oc
		.route({ tags: ["Pricing"], summary: "List pricing profiles" })
		.input(z.object({ listingId: z.string() }))
		.output(z.array(pricingProfileOutput)),

	getWorkspaceState: oc
		.route({
			tags: ["Pricing"],
			summary: "Get pricing workspace state for a listing",
		})
		.input(z.object({ listingId: z.string() }))
		.output(pricingWorkspaceStateOutput),

	addRule: oc
		.route({ tags: ["Pricing"], summary: "Add pricing rule" })
		.input(
			z.object({
				listingId: z.string(),
				pricingProfileId: z.string(),
				name: z.string().min(1),
				ruleType: z.string().min(1),
				conditionJson: z.record(z.string(), z.unknown()),
				adjustmentType: z.enum(["percent", "flat_cents"]),
				adjustmentValue: z.number().int(),
				priority: z.number().int().optional(),
			}),
		)
		.output(pricingRuleOutput),

	deleteRule: oc
		.route({ tags: ["Pricing"], summary: "Delete pricing rule" })
		.input(z.object({ id: z.string() }))
		.output(z.object({ success: z.boolean() })),

	getQuote: oc
		.route({ tags: ["Pricing"], summary: "Get quote for a slot" })
		.input(
			z.object({
				listingId: z.string(),
				startsAt: z.string().datetime(),
				endsAt: z.string().datetime(),
				passengers: z.number().int().positive().optional(),
			}),
		)
		.output(quoteBreakdownOutput),
};
