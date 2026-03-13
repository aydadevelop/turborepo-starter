import { oc } from "@orpc/contract";
import z from "zod";

const serviceFamilyPolicySchema = z.object({
	key: z.enum(["boat_rent", "excursions"]),
	label: z.string(),
	availabilityMode: z.enum(["duration", "schedule"]),
	operatorSections: z.array(
		z.enum([
			"basics",
			"pricing",
			"availability",
			"assets",
			"calendar",
			"publish",
		])
	),
	defaults: z.object({
		moderationRequired: z.boolean(),
		requiresLocation: z.boolean(),
	}),
	customerPresentation: z.object({
		bookingMode: z.enum(["request", "book"]),
		customerFocus: z.enum(["asset", "experience"]),
		reviewsMode: z.enum(["standard", "validated"]),
	}),
});

const storefrontListItemSchema = z.object({
	boatRentSummary: z
		.object({
			basePort: z.string().nullable(),
			capacity: z.number().int().positive().nullable(),
			captainMode: z.enum([
				"captained_only",
				"self_drive_only",
				"captain_optional",
			]),
			captainModeLabel: z.string(),
			departureArea: z.string().nullable(),
			depositRequired: z.boolean(),
			fuelPolicy: z.enum(["included", "charged_by_usage", "return_same_level"]),
			fuelPolicyLabel: z.string(),
			instantBookAllowed: z.boolean(),
		})
		.nullable(),
	excursionSummary: z
		.object({
			meetingPoint: z.string().nullable(),
			durationMinutes: z.number().int().positive().nullable(),
			durationLabel: z.string().nullable(),
			groupFormat: z.enum(["group", "private", "both"]),
			groupFormatLabel: z.string(),
			maxGroupSize: z.number().int().positive().nullable(),
			primaryLanguage: z.string().nullable(),
			ticketsIncluded: z.boolean(),
			childFriendly: z.boolean(),
			instantBookAllowed: z.boolean(),
		})
		.nullable(),
	id: z.string(),
	listingTypeSlug: z.string(),
	listingTypeLabel: z.string(),
	serviceFamily: z.enum(["boat_rent", "excursions"]),
	serviceFamilyPolicy: serviceFamilyPolicySchema,
	name: z.string(),
	slug: z.string(),
	description: z.string().nullable(),
	metadata: z.record(z.string(), z.unknown()).nullable(),
	primaryImageUrl: z.string().url().nullable(),
	createdAt: z.string().datetime(),
});

const bookingSurfaceSlotQuoteSchema = z.object({
	listingId: z.string(),
	profileId: z.string(),
	currency: z.string(),
	durationMinutes: z.number().int().positive(),
	baseCents: z.number().int(),
	adjustmentCents: z.number().int(),
	subtotalCents: z.number().int(),
	serviceFeeCents: z.number().int(),
	taxCents: z.number().int(),
	totalCents: z.number().int(),
	hasSpecialPricing: z.boolean(),
	discountPreview: z
		.object({
			code: z.string(),
			status: z.enum(["applied", "invalid"]),
			reasonCode: z
				.enum([
					"PROMOTION_CODE_NOT_FOUND",
					"PROMOTION_CODE_INACTIVE",
					"PROMOTION_CODE_NOT_STARTED",
					"PROMOTION_CODE_EXPIRED",
					"PROMOTION_CODE_LISTING_MISMATCH",
					"PROMOTION_CODE_USAGE_LIMIT_REACHED",
					"PROMOTION_CODE_CUSTOMER_LIMIT_REACHED",
					"PROMOTION_CODE_MINIMUM_SUBTOTAL_NOT_MET",
				])
				.nullable(),
			reasonLabel: z.string().nullable(),
			appliedAmountCents: z.number().int(),
			discountedSubtotalCents: z.number().int().nullable(),
			discountedServiceFeeCents: z.number().int().nullable(),
			discountedTaxCents: z.number().int().nullable(),
			discountedTotalCents: z.number().int().nullable(),
		})
		.nullable(),
});

const bookingSurfaceSlotSchema = z.object({
	blockReason: z.string().nullable(),
	blockSource: z
		.enum(["booking", "manual", "calendar", "maintenance", "system"])
		.nullable(),
	endsAt: z.string().datetime(),
	endsAtLabel: z.string(),
	minimumDurationMinutes: z.number().int().positive(),
	quote: bookingSurfaceSlotQuoteSchema.nullable(),
	startsAt: z.string().datetime(),
	startsAtLabel: z.string(),
	status: z.enum([
		"available",
		"blocked",
		"notice_too_short",
		"minimum_duration_not_met",
	]),
	statusLabel: z.string(),
});

const bookingSurfaceSchema = z.object({
	currency: z.string().nullable(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	durationOptionsMinutes: z.array(z.number().int().positive()),
	listingId: z.string(),
	minimumDurationMinutes: z.number().int().positive(),
	minimumNoticeMinutes: z.number().int().min(0),
	passengers: z.number().int().positive().nullable(),
	pricingConfigured: z.boolean(),
	requestedDurationMinutes: z.number().int().positive(),
	requestedDiscountCode: z.string().nullable(),
	serviceFamily: z.literal("boat_rent"),
	slotStepMinutes: z.number().int().positive(),
	slots: z.array(bookingSurfaceSlotSchema),
	summary: z.object({
		availableSlotCount: z.number().int().min(0),
		blockedSlotCount: z.number().int().min(0),
		minimumDurationSlotCount: z.number().int().min(0),
		noticeTooShortSlotCount: z.number().int().min(0),
		specialPricedSlotCount: z.number().int().min(0),
		totalSlotCount: z.number().int().min(0),
	}),
	timezone: z.string(),
});

export const storefrontContract = {
	list: oc
		.route({
			tags: ["Storefront"],
			summary: "Browse published listings",
			description:
				"Returns published marketplace listings with optional type and keyword filters.",
		})
		.input(
			z.object({
				type: z.string().optional(),
				q: z.string().max(200).optional(),
				limit: z.number().int().min(1).max(100).default(20),
				offset: z.number().int().min(0).default(0),
			})
		)
		.output(
			z.object({
				items: z.array(storefrontListItemSchema),
				total: z.number().int(),
			})
		),

	get: oc
		.route({
			tags: ["Storefront"],
			summary: "Get published listing detail",
			description: "Returns detail for a single published marketplace listing.",
		})
		.input(z.object({ id: z.string() }))
		.output(storefrontListItemSchema),

	getBookingSurface: oc
		.route({
			tags: ["Storefront"],
			summary: "Get a composed public booking surface for a listing",
			description:
				"Returns a customer-facing booking surface with slot availability, duration guidance, and price previews.",
		})
		.input(
			z.object({
				listingId: z.string(),
				date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				durationMinutes: z.number().int().min(30),
				passengers: z.number().int().positive().optional(),
				discountCode: z.string().min(1).max(64).optional(),
			}),
		)
		.output(bookingSurfaceSchema),
};
