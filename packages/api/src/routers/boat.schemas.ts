import {
	availabilityBlockSourceValues,
	boatAssetPurposeValues,
	boatAssetTypeValues,
	boatStatusValues,
	boatTypeValues,
	calendarProviderValues,
	pricingAdjustmentTypeValues,
	pricingRuleTypeValues,
} from "@full-stack-cf-app/db/schema/boat";
import z from "zod";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const optionalTrimmedString = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((value) => (value && value.length > 0 ? value : undefined));

export const normalizeBoatSlug = (value: string) =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

export const isValidBoatSlug = (slug: string) => slugPattern.test(slug);

export const boatIdInputSchema = z.object({
	boatId: z.string().trim().min(1),
});

export const listManagedBoatsInputSchema = z.object({
	search: optionalTrimmedString(120),
	status: z.enum(boatStatusValues).optional(),
	dockId: z.string().trim().optional(),
	includeArchived: z.boolean().optional().default(false),
	limit: z.number().int().min(1).max(100).default(50),
});

export const getManagedBoatInputSchema = boatIdInputSchema.extend({
	withAmenities: z.boolean().optional().default(true),
	withAssets: z.boolean().optional().default(true),
	withCalendarConnections: z.boolean().optional().default(true),
	withAvailability: z.boolean().optional().default(true),
	withPricing: z.boolean().optional().default(true),
});

export const createManagedBoatInputSchema = z
	.object({
		name: z.string().trim().min(2).max(120),
		slug: optionalTrimmedString(120),
		description: optionalTrimmedString(2000),
		type: z.enum(boatTypeValues).default("other"),
		passengerCapacity: z.number().int().min(1).max(500).default(1),
		crewCapacity: z.number().int().min(0).max(50).default(0),
		minimumHours: z.number().int().min(1).max(24).default(1),
		minimumNoticeMinutes: z
			.number()
			.int()
			.min(0)
			.max(24 * 60)
			.default(0),
		workingHoursStart: z.number().int().min(0).max(23).default(9),
		workingHoursEnd: z.number().int().min(1).max(24).default(21),
		timezone: z.string().trim().min(2).max(120).default("UTC"),
		status: z.enum(boatStatusValues).default("draft"),
		dockId: z.string().trim().optional(),
		metadata: optionalTrimmedString(10_000),
	})
	.refine((input) => input.workingHoursStart < input.workingHoursEnd, {
		message: "workingHoursStart must be earlier than workingHoursEnd",
		path: ["workingHoursEnd"],
	});

export const updateManagedBoatInputSchema = z
	.object({
		boatId: z.string().trim().min(1),
		name: optionalTrimmedString(120),
		slug: optionalTrimmedString(120),
		description: optionalTrimmedString(2000),
		type: z.enum(boatTypeValues).optional(),
		passengerCapacity: z.number().int().min(1).max(500).optional(),
		crewCapacity: z.number().int().min(0).max(50).optional(),
		minimumHours: z.number().int().min(1).max(24).optional(),
		minimumNoticeMinutes: z
			.number()
			.int()
			.min(0)
			.max(24 * 60)
			.optional(),
		workingHoursStart: z.number().int().min(0).max(23).optional(),
		workingHoursEnd: z.number().int().min(1).max(24).optional(),
		timezone: z.string().trim().min(2).max(120).optional(),
		status: z.enum(boatStatusValues).optional(),
		dockId: z.string().trim().nullable().optional(),
		metadata: optionalTrimmedString(10_000),
		isActive: z.boolean().optional(),
	})
	.refine(
		(input) =>
			!(
				input.workingHoursStart !== undefined &&
				input.workingHoursEnd !== undefined &&
				input.workingHoursStart >= input.workingHoursEnd
			),
		{
			message: "workingHoursStart must be earlier than workingHoursEnd",
			path: ["workingHoursEnd"],
		}
	);

export const archiveManagedBoatInputSchema = boatIdInputSchema;

export const listBoatDocksInputSchema = z.object({
	search: optionalTrimmedString(120),
	limit: z.number().int().min(1).max(100).default(50),
});

export const upsertBoatDockInputSchema = z.object({
	id: z.string().trim().optional(),
	name: z.string().trim().min(2).max(120),
	slug: optionalTrimmedString(120),
	description: optionalTrimmedString(2000),
	address: optionalTrimmedString(500),
	latitude: z.number().min(-90).max(90).optional(),
	longitude: z.number().min(-180).max(180).optional(),
	isActive: z.boolean().optional().default(true),
});

export const replaceBoatAmenitiesInputSchema = boatIdInputSchema.extend({
	amenities: z
		.array(
			z.object({
				key: z.string().trim().min(1).max(100),
				label: optionalTrimmedString(120),
				isEnabled: z.boolean().optional().default(true),
				value: optionalTrimmedString(500),
			})
		)
		.max(200),
});

export const listBoatAssetsInputSchema = boatIdInputSchema.extend({
	assetType: z.enum(boatAssetTypeValues).optional(),
	purpose: z.enum(boatAssetPurposeValues).optional(),
});

export const createBoatAssetInputSchema = boatIdInputSchema.extend({
	assetType: z.enum(boatAssetTypeValues),
	purpose: z.enum(boatAssetPurposeValues).default("gallery"),
	storageKey: z.string().trim().min(1).max(500),
	fileName: optionalTrimmedString(255),
	mimeType: optionalTrimmedString(255),
	sizeBytes: z.number().int().min(0).optional(),
	sortOrder: z.number().int().min(0).max(10_000).default(0),
	isPrimary: z.boolean().default(false),
});

export const listBoatCalendarConnectionsInputSchema = boatIdInputSchema;

export const upsertBoatCalendarConnectionInputSchema = boatIdInputSchema.extend(
	{
		id: z.string().trim().optional(),
		provider: z.enum(calendarProviderValues),
		externalCalendarId: z.string().trim().min(1).max(255),
		syncToken: optionalTrimmedString(4000),
		watchChannelId: optionalTrimmedString(255),
		watchResourceId: optionalTrimmedString(255),
		watchExpiresAt: z.coerce.date().optional(),
		lastSyncedAt: z.coerce.date().optional(),
		syncStatus: z.enum(["idle", "syncing", "error", "disabled"]).optional(),
		lastError: optionalTrimmedString(2000),
		isPrimary: z.boolean().optional().default(false),
	}
);

export const listBoatAvailabilityRulesInputSchema = boatIdInputSchema;

export const replaceBoatAvailabilityRulesInputSchema = boatIdInputSchema.extend(
	{
		rules: z
			.array(
				z
					.object({
						dayOfWeek: z.number().int().min(0).max(6),
						startMinute: z
							.number()
							.int()
							.min(0)
							.max(24 * 60 - 1),
						endMinute: z
							.number()
							.int()
							.min(1)
							.max(24 * 60),
						isActive: z.boolean().default(true),
					})
					.refine((rule) => rule.startMinute < rule.endMinute, {
						message: "startMinute must be less than endMinute",
						path: ["endMinute"],
					})
			)
			.max(50),
	}
);

export const listBoatAvailabilityBlocksInputSchema = boatIdInputSchema.extend({
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
	source: z.enum(availabilityBlockSourceValues).optional(),
});

export const createBoatAvailabilityBlockInputSchema = boatIdInputSchema
	.extend({
		calendarConnectionId: z.string().trim().optional(),
		source: z.enum(availabilityBlockSourceValues).default("manual"),
		externalRef: optionalTrimmedString(255),
		startsAt: z.coerce.date(),
		endsAt: z.coerce.date(),
		reason: optionalTrimmedString(1000),
		isActive: z.boolean().optional().default(true),
	})
	.refine((value) => value.startsAt < value.endsAt, {
		message: "startsAt must be before endsAt",
		path: ["endsAt"],
	});

export const deleteBoatAvailabilityBlockInputSchema = boatIdInputSchema.extend({
	blockId: z.string().trim().min(1),
});

export const listBoatPricingProfilesInputSchema = boatIdInputSchema.extend({
	includeArchived: z.boolean().optional().default(false),
});

export const createBoatPricingProfileInputSchema = boatIdInputSchema.extend({
	name: z.string().trim().min(2).max(120),
	currency: z.string().trim().length(3).default("RUB"),
	baseHourlyPriceCents: z.number().int().min(0),
	minimumHours: z.number().int().min(1).max(24).default(1),
	depositPercentage: z.number().int().min(0).max(100).default(0),
	serviceFeePercentage: z.number().int().min(0).max(100).default(0),
	affiliateFeePercentage: z.number().int().min(0).max(100).default(0),
	taxPercentage: z.number().int().min(0).max(100).default(0),
	acquiringFeePercentage: z.number().int().min(0).max(100).default(0),
	validFrom: z.coerce.date().optional(),
	validTo: z.coerce.date().optional(),
	isDefault: z.boolean().optional().default(false),
});

export const setDefaultBoatPricingProfileInputSchema = boatIdInputSchema.extend(
	{
		pricingProfileId: z.string().trim().min(1),
	}
);

export const listBoatPricingRulesInputSchema = boatIdInputSchema.extend({
	pricingProfileId: z.string().trim().optional(),
});

export const createBoatPricingRuleInputSchema = boatIdInputSchema.extend({
	pricingProfileId: z.string().trim().optional(),
	name: z.string().trim().min(2).max(120),
	ruleType: z.enum(pricingRuleTypeValues),
	conditionJson: z.string().trim().min(2).max(5000).default("{}"),
	adjustmentType: z.enum(pricingAdjustmentTypeValues),
	adjustmentValue: z.number().int(),
	priority: z.number().int().min(-1000).max(1000).default(0),
	isActive: z.boolean().default(true),
});

export const deleteBoatPricingRuleInputSchema = boatIdInputSchema.extend({
	ruleId: z.string().trim().min(1),
});
