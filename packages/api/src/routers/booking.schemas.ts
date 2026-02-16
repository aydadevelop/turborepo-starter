import { affiliatePayoutStatusValues } from "@full-stack-cf-app/db/schema/affiliate";
import { boatTypeValues } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCalendarLink,
	bookingCalendarProviderValues,
	bookingCalendarSyncStatusValues,
	bookingCancellationRequest,
	bookingCancellationRequestStatusValues,
	bookingDiscountApplication,
	bookingDiscountCode,
	bookingDispute,
	bookingDisputeStatusValues,
	bookingPaymentAttempt,
	bookingPaymentAttemptStatusValues,
	bookingPaymentStatusValues,
	bookingRefund,
	bookingRefundStatusValues,
	bookingShiftRequest,
	bookingShiftRequestStatusValues,
	bookingSourceValues,
	bookingStatusValues,
	discountTypeValues,
} from "@full-stack-cf-app/db/schema/booking";
import { createSelectSchema } from "drizzle-orm/zod";
import z from "zod";
import { boatMinimumDurationRuleOutputSchema } from "./boat/schemas";
import {
	bookingCancellationEvidenceTypeValues,
	bookingCancellationReasonCodeValues,
} from "./booking/cancellation/policy.templates";
import { optionalTrimmedString } from "./shared/schema-utils";

const discountCodePattern = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

export const normalizeDiscountCode = (value: string) =>
	value.toUpperCase().trim().replace(/\s+/g, "");

export const isValidDiscountCode = (value: string) =>
	discountCodePattern.test(value);

export const bookingIdInputSchema = z.object({
	bookingId: z.string().trim().min(1),
});

export const listMineBookingsInputSchema = z.object({
	status: z.enum(bookingStatusValues).optional(),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
	sortBy: z
		.enum(["startsAt", "createdAt", "totalPriceCents"])
		.default("startsAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
	offset: z.number().int().min(0).default(0),
	limit: z.number().int().min(1).max(100).default(20),
});

export const listAffiliateBookingsInputSchema =
	listMineBookingsInputSchema.extend({
		organizationId: z.string().trim().optional(),
	});

export const listManagedAffiliatePayoutsInputSchema = z.object({
	organizationId: z.string().trim().optional(),
	affiliateUserId: z.string().trim().optional(),
	status: z.enum(affiliatePayoutStatusValues).optional(),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
	limit: z.number().int().min(1).max(200).default(100),
	offset: z.number().int().min(0).default(0),
});

export const listManagedBookingsInputSchema = z.object({
	boatId: z.string().trim().optional(),
	status: z.enum(bookingStatusValues).optional(),
	paymentStatus: z.enum(bookingPaymentStatusValues).optional(),
	source: z.enum(bookingSourceValues).optional(),
	customerUserId: z.string().trim().optional(),
	calendarSyncStatus: z.enum(bookingCalendarSyncStatusValues).optional(),
	search: optionalTrimmedString(120),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
	sortBy: z
		.enum(["startsAt", "createdAt", "totalPriceCents"])
		.default("startsAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
	offset: z.number().int().min(0).default(0),
	limit: z.number().int().min(1).max(100).default(50),
});

export const getManagedBookingInputSchema = bookingIdInputSchema.extend({
	includeDiscountApplication: z.boolean().optional().default(true),
	includeCalendarLink: z.boolean().optional().default(true),
});

export const createManagedBookingInputSchema = z
	.object({
		boatId: z.string().trim().min(1),
		customerUserId: z.string().trim().optional(),
		source: z.enum(bookingSourceValues).default("manual"),
		status: z.enum(bookingStatusValues).default("pending"),
		paymentStatus: z.enum(bookingPaymentStatusValues).default("unpaid"),
		startsAt: z.coerce.date(),
		endsAt: z.coerce.date(),
		passengers: z.number().int().min(1).max(500),
		contactName: optionalTrimmedString(120),
		contactPhone: optionalTrimmedString(40),
		contactEmail: z.string().trim().email().max(200).optional(),
		timezone: z.string().trim().min(2).max(120).default("UTC"),
		basePriceCents: z.number().int().min(0),
		currency: z.string().trim().length(3).default("RUB"),
		calendarLink: z.object({
			boatCalendarConnectionId: z.string().trim().optional(),
			provider: z.enum(bookingCalendarProviderValues),
			externalCalendarId: optionalTrimmedString(255),
			externalEventId: z.string().trim().min(1).max(255),
			iCalUid: optionalTrimmedString(255),
			externalEventVersion: optionalTrimmedString(255),
			syncedAt: z.coerce.date().optional(),
		}),
		discountCode: optionalTrimmedString(40),
		notes: optionalTrimmedString(2000),
		specialRequests: optionalTrimmedString(2000),
		externalRef: optionalTrimmedString(255),
		metadata: optionalTrimmedString(10_000),
	})
	.refine((value) => value.startsAt < value.endsAt, {
		message: "startsAt must be before endsAt",
		path: ["endsAt"],
	});

export const cancellationEvidenceInputSchema = z.object({
	type: z.enum(bookingCancellationEvidenceTypeValues).default("other"),
	url: z.string().trim().url().max(1500),
	note: optionalTrimmedString(500),
});

const cancellationReasonCodeSchema = z.enum(
	bookingCancellationReasonCodeValues
);

export const cancelManagedBookingInputSchema = bookingIdInputSchema.extend({
	reason: optionalTrimmedString(1000),
	reasonCode: cancellationReasonCodeSchema.optional(),
	evidence: z.array(cancellationEvidenceInputSchema).max(10).optional(),
});

export const listPublicBoatAvailabilityInputSchema = z
	.object({
		organizationId: z.string().trim().optional(),
		dockId: z.string().trim().optional(),
		boatId: z.string().trim().optional(),
		boatType: z.enum(boatTypeValues).optional(),
		startsAt: z.coerce.date().optional(),
		endsAt: z.coerce.date().optional(),
		date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		durationHours: z.number().min(0.5).max(24).optional(),
		passengers: z.number().int().min(1).max(500).default(1),
		search: optionalTrimmedString(120),
		amenityKeys: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
		minEstimatedTotalCents: z.number().int().min(0).optional(),
		maxEstimatedTotalCents: z.number().int().min(0).optional(),
		includeUnavailable: z.boolean().optional().default(false),
		withSlots: z.boolean().optional().default(false),
		sortBy: z
			.enum([
				"newest",
				"price_asc",
				"price_desc",
				"capacity_desc",
				"availability_bands",
			])
			.default("newest"),
		offset: z.number().int().min(0).default(0),
		limit: z.number().int().min(1).max(100).default(30),
	})
	.superRefine((value, context) => {
		const hasStartsAt = value.startsAt !== undefined;
		const hasEndsAt = value.endsAt !== undefined;
		const hasDate = value.date !== undefined;
		const hasDurationHours = value.durationHours !== undefined;
		const usesRangeMode = hasStartsAt || hasEndsAt;
		const usesDateMode = hasDate || hasDurationHours;

		if (usesRangeMode && usesDateMode) {
			context.addIssue({
				code: "custom",
				message:
					"Use either startsAt/endsAt or date/durationHours, but not both",
				path: ["startsAt"],
			});
			return;
		}

		if (usesRangeMode) {
			const startsAt = value.startsAt;
			const endsAt = value.endsAt;
			if (startsAt === undefined || endsAt === undefined) {
				context.addIssue({
					code: "custom",
					message: "startsAt and endsAt are both required in range mode",
					path: ["endsAt"],
				});
				return;
			}

			if (startsAt >= endsAt) {
				context.addIssue({
					code: "custom",
					message: "startsAt must be before endsAt",
					path: ["endsAt"],
				});
			}
		} else if (usesDateMode) {
			if (value.date === undefined || value.durationHours === undefined) {
				context.addIssue({
					code: "custom",
					message: "date and durationHours are both required in date mode",
					path: ["durationHours"],
				});
			}
		} else {
			context.addIssue({
				code: "custom",
				message: "Provide either startsAt/endsAt or date/durationHours",
				path: ["startsAt"],
			});
		}

		if (
			value.minEstimatedTotalCents !== undefined &&
			value.maxEstimatedTotalCents !== undefined &&
			value.minEstimatedTotalCents > value.maxEstimatedTotalCents
		) {
			context.addIssue({
				code: "custom",
				message: "minEstimatedTotalCents must be <= maxEstimatedTotalCents",
				path: ["maxEstimatedTotalCents"],
			});
		}
	});

export const getBoatByIdPublicInputSchema = z.object({
	boatId: z.string().trim().min(1),
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	passengers: z.number().int().min(1).max(500).default(1),
	durationHours: z.number().min(0.5).max(24).default(1),
	includeInactive: z.boolean().optional().default(false),
});

export const getPublicBookingQuoteInputSchema = z
	.object({
		boatId: z.string().trim().min(1),
		startsAt: z.coerce.date(),
		endsAt: z.coerce.date(),
		passengers: z.number().int().min(1).max(500),
		discountCode: optionalTrimmedString(40),
	})
	.refine((value) => value.startsAt < value.endsAt, {
		message: "startsAt must be before endsAt",
		path: ["endsAt"],
	});

export const getPublicCheckoutReadModelInputSchema = z
	.object({
		boatId: z.string().trim().min(1),
		startsAt: z.coerce.date(),
		endsAt: z.coerce.date(),
		passengers: z.number().int().min(1).max(500),
		discountCode: optionalTrimmedString(40),
		locale: z.string().trim().min(2).max(20).default("en-US"),
	})
	.refine((value) => value.startsAt < value.endsAt, {
		message: "startsAt must be before endsAt",
		path: ["endsAt"],
	});

export const createPublicBookingInputSchema = z
	.object({
		boatId: z.string().trim().min(1),
		startsAt: z.coerce.date(),
		endsAt: z.coerce.date(),
		passengers: z.number().int().min(1).max(500),
		contactName: z.string().trim().min(2).max(120),
		contactPhone: optionalTrimmedString(40),
		contactEmail: z.string().trim().email().max(200).optional(),
		timezone: z.string().trim().min(2).max(120).default("UTC"),
		source: z.enum(bookingSourceValues).default("web"),
		discountCode: optionalTrimmedString(40),
		notes: optionalTrimmedString(2000),
		specialRequests: optionalTrimmedString(2000),
		externalRef: optionalTrimmedString(255),
		metadata: optionalTrimmedString(10_000),
	})
	.refine((value) => value.startsAt < value.endsAt, {
		message: "startsAt must be before endsAt",
		path: ["endsAt"],
	})
	.refine((value) => Boolean(value.contactPhone || value.contactEmail), {
		message: "Either contactPhone or contactEmail is required",
		path: ["contactPhone"],
	});

export const requestBookingCancellationInputSchema =
	bookingIdInputSchema.extend({
		reason: optionalTrimmedString(1000),
		reasonCode: cancellationReasonCodeSchema.optional(),
		evidence: z.array(cancellationEvidenceInputSchema).max(10).optional(),
	});

export const reviewBookingCancellationInputSchema = bookingIdInputSchema.extend(
	{
		decision: z.enum(["approve", "reject"]),
		reviewNote: optionalTrimmedString(1000),
		reasonCode: cancellationReasonCodeSchema.optional(),
		evidence: z.array(cancellationEvidenceInputSchema).max(10).optional(),
	}
);

export const listMineBookingCancellationRequestsInputSchema = z.object({
	status: z.enum(bookingCancellationRequestStatusValues).optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const listManagedBookingCancellationRequestsInputSchema = z.object({
	status: z.enum(bookingCancellationRequestStatusValues).optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const createBookingShiftRequestInputSchema = bookingIdInputSchema
	.extend({
		startsAt: z.coerce.date(),
		endsAt: z.coerce.date(),
		passengers: z.number().int().min(1).max(500).optional(),
		reason: optionalTrimmedString(1000),
	})
	.refine((value) => value.startsAt < value.endsAt, {
		message: "startsAt must be before endsAt",
		path: ["endsAt"],
	});

export const listMineBookingShiftRequestsInputSchema = z.object({
	status: z.enum(bookingShiftRequestStatusValues).optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const listManagedBookingShiftRequestsInputSchema = z.object({
	status: z.enum(bookingShiftRequestStatusValues).optional(),
	bookingId: z.string().trim().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const reviewBookingShiftRequestMineInputSchema =
	bookingIdInputSchema.extend({
		decision: z.enum(["approve", "reject"]),
		note: optionalTrimmedString(1000),
	});

export const reviewBookingShiftRequestManagedInputSchema =
	bookingIdInputSchema.extend({
		decision: z.enum(["approve", "reject"]),
		note: optionalTrimmedString(1000),
	});

export const createBookingDisputeInputSchema = bookingIdInputSchema.extend({
	reasonCode: optionalTrimmedString(80),
	details: z.string().trim().min(5).max(5000),
});

export const listManagedBookingDisputesInputSchema = z.object({
	status: z.enum(bookingDisputeStatusValues).optional(),
	bookingId: z.string().trim().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const listMineBookingDisputesInputSchema = z.object({
	status: z.enum(bookingDisputeStatusValues).optional(),
	bookingId: z.string().trim().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const reviewBookingDisputeInputSchema = z.object({
	disputeId: z.string().trim().min(1),
	decision: z.enum(["resolve", "reject"]),
	resolution: z.string().trim().min(3).max(3000),
});

export const requestBookingRefundInputSchema = bookingIdInputSchema.extend({
	amountCents: z.number().int().min(1),
	reason: optionalTrimmedString(1000),
});

export const listManagedBookingRefundsInputSchema = z.object({
	status: z.enum(bookingRefundStatusValues).optional(),
	bookingId: z.string().trim().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const listMineBookingRefundsInputSchema = z.object({
	status: z.enum(bookingRefundStatusValues).optional(),
	bookingId: z.string().trim().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const reviewBookingRefundInputSchema = z.object({
	refundId: z.string().trim().min(1),
	decision: z.enum(["approve", "reject"]),
	approvedAmountCents: z.number().int().min(1).optional(),
	reviewNote: optionalTrimmedString(1000),
});

export const processBookingRefundInputSchema = z
	.object({
		refundId: z.string().trim().min(1),
		status: z.enum(["processed", "failed"]),
		provider: optionalTrimmedString(80),
		externalRefundId: optionalTrimmedString(255),
		failureReason: optionalTrimmedString(1000),
	})
	.refine((input) => !(input.status === "failed" && !input.failureReason), {
		message: "failureReason is required when status is failed",
		path: ["failureReason"],
	});

export const createBookingPaymentAttemptInputSchema = z.object({
	bookingId: z.string().trim().min(1),
	idempotencyKey: z.string().trim().min(6).max(120),
	provider: z.string().trim().min(1).max(80).default("manual"),
	autoCaptureMock: z.boolean().optional().default(false),
	providerIntentId: optionalTrimmedString(255),
	amountCents: z.number().int().min(1).optional(),
	currency: z.string().trim().length(3).default("RUB"),
	metadata: optionalTrimmedString(10_000),
});

export const listManagedBookingPaymentAttemptsInputSchema = z.object({
	bookingId: z.string().trim().optional(),
	status: z.enum(bookingPaymentAttemptStatusValues).optional(),
	limit: z.number().int().min(1).max(200).default(100),
});

export const listMineBookingPaymentAttemptsInputSchema = z.object({
	bookingId: z.string().trim().optional(),
	status: z.enum(bookingPaymentAttemptStatusValues).optional(),
	limit: z.number().int().min(1).max(200).default(100),
});

export const processManagedBookingPaymentAttemptInputSchema = z
	.object({
		paymentAttemptId: z.string().trim().min(1),
		status: z.enum([
			"requires_action",
			"authorized",
			"captured",
			"failed",
			"cancelled",
		]),
		providerIntentId: optionalTrimmedString(255),
		capturedAmountCents: z.number().int().min(1).optional(),
		failureReason: optionalTrimmedString(1000),
		metadata: optionalTrimmedString(10_000),
	})
	.refine(
		(input) =>
			!(input.status === "failed" && (input.failureReason?.length ?? 0) === 0),
		{
			message: "failureReason is required when status is failed",
			path: ["failureReason"],
		}
	);

export const processManagedAffiliatePayoutInputSchema = z.object({
	payoutId: z.string().trim().min(1),
	status: z.enum(["paid", "voided"]),
	externalPayoutRef: optionalTrimmedString(255),
	note: optionalTrimmedString(1000),
});

export const listManagedDiscountCodesInputSchema = z.object({
	search: optionalTrimmedString(100),
	activeOnly: z.boolean().optional().default(true),
	boatId: z.string().trim().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const upsertManagedDiscountCodeInputSchema = z
	.object({
		id: z.string().trim().optional(),
		code: z.string().trim().min(3).max(40),
		name: z.string().trim().min(2).max(120),
		description: optionalTrimmedString(1000),
		discountType: z.enum(discountTypeValues),
		discountValue: z.number().int().min(1),
		maxDiscountCents: z.number().int().min(1).optional(),
		minimumSubtotalCents: z.number().int().min(0).default(0),
		validFrom: z.coerce.date().optional(),
		validTo: z.coerce.date().optional(),
		usageLimit: z.number().int().min(1).optional(),
		perCustomerLimit: z.number().int().min(1).optional(),
		appliesToBoatId: z.string().trim().optional(),
		isActive: z.boolean().optional().default(true),
		metadata: optionalTrimmedString(10_000),
	})
	.refine(
		(input) =>
			!(input.validFrom && input.validTo && input.validFrom >= input.validTo),
		{
			message: "validTo must be after validFrom",
			path: ["validTo"],
		}
	)
	.refine(
		(input) =>
			!(input.discountType === "percentage" && input.discountValue > 100),
		{
			message: "percentage discountValue must be <= 100",
			path: ["discountValue"],
		}
	);

export const setManagedDiscountCodeActiveInputSchema = z.object({
	discountCodeId: z.string().trim().min(1),
	isActive: z.boolean(),
});

// ── Output schemas ──────────────────────────────────────────────────────

import {
	boatAmenityOutputSchema,
	boatAssetOutputSchema,
	boatAvailabilityBlockOutputSchema,
	boatDockOutputSchema,
	boatOutputSchema,
	boatPricingRuleOutputSchema,
} from "./boat/schemas";

export const bookingOutputSchema = createSelectSchema(booking);

export const bookingCalendarLinkOutputSchema =
	createSelectSchema(bookingCalendarLink);

export const bookingDiscountApplicationOutputSchema = createSelectSchema(
	bookingDiscountApplication
);

export const pricingQuoteOutputSchema = z.object({
	profileId: z.string(),
	currency: z.string(),
	baseHourlyPriceCents: z.number().int(),
	estimatedHours: z.number(),
	estimatedBasePriceCents: z.number().int(),
	serviceFeePercentage: z.number().int(),
	acquiringFeePercentage: z.number().int(),
	taxPercentage: z.number().int(),
	affiliateFeePercentage: z.number().int(),
	depositPercentage: z.number().int(),
	estimatedServiceFeeCents: z.number().int(),
	estimatedAcquiringFeeCents: z.number().int(),
	estimatedTaxCents: z.number().int(),
	estimatedAffiliateFeeCents: z.number().int(),
	estimatedTotalPriceCents: z.number().int(),
	estimatedPayNowCents: z.number().int(),
	estimatedPayLaterCents: z.number().int(),
});

export const slotWithPricingOutputSchema = z.object({
	startsAt: z.coerce.date(),
	endsAt: z.coerce.date(),
	durationMinutes: z.number(),
	estimatedHours: z.number(),
	subtotalCents: z.number().int(),
	totalPriceCents: z.number().int(),
	payNowCents: z.number().int(),
	payLaterCents: z.number().int(),
	currency: z.string(),
	discountLabel: z.string().nullable(),
	requiredMinimumDurationMinutes: z.number(),
	meetsMinimumDuration: z.boolean(),
});

export const availableFiltersOutputSchema = z.object({
	availableStartTimes: z.array(z.string()),
	passengerOptions: z.array(z.number().int()),
	durationOptions: z.array(z.number()),
});

export const availabilityPublicOutputSchema = z.object({
	items: z.array(
		z.object({
			boat: boatOutputSchema,
			pricingQuote: pricingQuoteOutputSchema,
			available: z.boolean(),
			slots: z.array(slotWithPricingOutputSchema).optional(),
		})
	),
	total: z.number().int(),
	amenityCounts: z.record(z.string(), z.number()),
	availableFilters: availableFiltersOutputSchema.optional(),
});

export const getBoatByIdPublicOutputSchema = z.object({
	boat: boatOutputSchema,
	dock: boatDockOutputSchema.nullable(),
	amenities: z.array(boatAmenityOutputSchema),
	galleryAssets: z.array(boatAssetOutputSchema),
	pricingQuote: pricingQuoteOutputSchema.nullable(),
	pricingRules: z.array(boatPricingRuleOutputSchema),
	availabilityBlocks: z.array(boatAvailabilityBlockOutputSchema),
	minimumDurationRules: z.array(boatMinimumDurationRuleOutputSchema),
	slots: z.array(slotWithPricingOutputSchema),
	availableFilters: availableFiltersOutputSchema,
});

export const quotePublicOutputSchema = z.object({
	boat: boatOutputSchema,
	pricingQuote: pricingQuoteOutputSchema,
	pricingQuoteAfterDiscount: pricingQuoteOutputSchema,
	discount: z
		.object({
			code: z.string(),
			discountType: z.enum(discountTypeValues),
			discountValue: z.number().int(),
			discountAmountCents: z.number().int(),
		})
		.nullable(),
	estimatedTotalAfterDiscountCents: z.number().int(),
	estimatedPayNowAfterDiscountCents: z.number().int(),
	estimatedPayLaterAfterDiscountCents: z.number().int(),
});

export const checkoutReadModelLineItemOutputSchema = z.object({
	key: z.string(),
	label: z.string(),
	amountCents: z.number().int(),
	formattedAmount: z.string(),
	dueAt: z.enum(["now", "later", "total"]),
});

export const checkoutReadModelPolicyOutputSchema = z.object({
	key: z.string(),
	title: z.string(),
	description: z.string(),
});

export const checkoutReadModelPublicOutputSchema = z.object({
	boat: boatOutputSchema,
	pricingQuote: pricingQuoteOutputSchema,
	pricingQuoteAfterDiscount: pricingQuoteOutputSchema,
	discount: z
		.object({
			code: z.string(),
			discountType: z.enum(discountTypeValues),
			discountValue: z.number().int(),
			discountAmountCents: z.number().int(),
		})
		.nullable(),
	lineItems: z.array(checkoutReadModelLineItemOutputSchema),
	policies: z.array(checkoutReadModelPolicyOutputSchema),
	totals: z.object({
		totalCents: z.number().int(),
		payNowCents: z.number().int(),
		payLaterCents: z.number().int(),
		totalFormatted: z.string(),
		payNowFormatted: z.string(),
		payLaterFormatted: z.string(),
	}),
	itinerary: z.object({
		timezone: z.string(),
		startsAt: z.coerce.date(),
		endsAt: z.coerce.date(),
		startsAtLabel: z.string(),
		endsAtLabel: z.string(),
		durationHours: z.number(),
		passengers: z.number().int(),
	}),
});

export const createPublicBookingOutputSchema = z.object({
	booking: bookingOutputSchema,
	calendarLink: bookingCalendarLinkOutputSchema.optional(),
	discountApplication: bookingDiscountApplicationOutputSchema.nullable(),
	pricingQuote: pricingQuoteOutputSchema,
	pricingQuoteAfterDiscount: pricingQuoteOutputSchema,
	estimatedTotalAfterDiscountCents: z.number().int(),
	estimatedPayNowAfterDiscountCents: z.number().int(),
	estimatedPayLaterAfterDiscountCents: z.number().int(),
});

export const listManagedBookingsOutputSchema = z.object({
	items: z.array(bookingOutputSchema),
	total: z.number().int(),
});

export const listMineBookingsOutputSchema = z.object({
	items: z.array(bookingOutputSchema),
	total: z.number().int(),
});

export const affiliateBookingSummaryOutputSchema = z.object({
	bookingRef: z.string(),
	customerRef: z.string(),
	referralCode: z.string(),
	boatId: z.string(),
	boatName: z.string(),
	startsAt: z.coerce.date(),
	endsAt: z.coerce.date(),
	timezone: z.string(),
	status: z.enum(bookingStatusValues),
	paymentStatus: z.enum(bookingPaymentStatusValues),
	passengers: z.number().int(),
	commissionAmountCents: z.number().int(),
	commissionCurrency: z.string(),
	payoutStatus: z.enum(affiliatePayoutStatusValues),
	payoutEligibleAt: z.coerce.date().nullable(),
	payoutPaidAt: z.coerce.date().nullable(),
	payoutVoidedAt: z.coerce.date().nullable(),
	payoutVoidReason: z.string().nullable(),
});

export const listAffiliateBookingsOutputSchema = z.object({
	items: z.array(affiliateBookingSummaryOutputSchema),
	total: z.number().int(),
});

export const affiliatePayoutSummaryOutputSchema = z.object({
	payoutId: z.string(),
	bookingId: z.string(),
	bookingRef: z.string(),
	affiliateUserId: z.string(),
	referralCode: z.string(),
	commissionAmountCents: z.number().int(),
	currency: z.string(),
	status: z.enum(affiliatePayoutStatusValues),
	eligibleAt: z.coerce.date().nullable(),
	paidAt: z.coerce.date().nullable(),
	voidedAt: z.coerce.date().nullable(),
	voidReason: z.string().nullable(),
	startsAt: z.coerce.date(),
	endsAt: z.coerce.date(),
	boatId: z.string(),
	boatName: z.string(),
});

export const listManagedAffiliatePayoutsOutputSchema = z.object({
	items: z.array(affiliatePayoutSummaryOutputSchema),
	total: z.number().int(),
});

export const getManagedBookingOutputSchema = z.object({
	booking: bookingOutputSchema,
	calendarLink: bookingCalendarLinkOutputSchema.optional(),
	discountApplication: bookingDiscountApplicationOutputSchema.optional(),
});

export const createManagedBookingOutputSchema = z.object({
	booking: bookingOutputSchema,
	calendarLink: bookingCalendarLinkOutputSchema.optional(),
	discountApplication: bookingDiscountApplicationOutputSchema.nullable(),
});

export const bookingCancellationRequestOutputSchema = createSelectSchema(
	bookingCancellationRequest
);

export const bookingShiftRequestOutputSchema =
	createSelectSchema(bookingShiftRequest);

export const bookingDisputeOutputSchema = createSelectSchema(bookingDispute);

export const bookingRefundOutputSchema = createSelectSchema(bookingRefund);

export const bookingPaymentAttemptOutputSchema = createSelectSchema(
	bookingPaymentAttempt
);

export const discountCodeOutputSchema = createSelectSchema(bookingDiscountCode);
