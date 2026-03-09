import { sql } from "drizzle-orm";
import {
	boolean,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { member, organization, user } from "./auth";
import { timestamps } from "./columns";

/**
 * Draft marketplace schema.
 *
 * Search-extension-dependent fields/indexes (pgvector / pg_textsearch / earthdistance)
 * are intentionally omitted from the exported runtime schema for now because the current
 * test setup uses PGlite and pushes the full schema in-memory. Add those columns/indexes
 * in a later phase once the test harness supports extension-aware Postgres.
 */

export const listingStatusValues = [
	"draft",
	"active",
	"maintenance",
	"inactive",
] as const;
export const publicationChannelTypeValues = [
	"own_site",
	"platform_marketplace",
	"partner_site",
	"widget",
] as const;
export const publicationVisibilityValues = [
	"public",
	"unlisted",
	"private",
] as const;
export const merchantTypeValues = ["owner", "platform"] as const;
export const paymentProviderValues = ["cloudpayments", "stripe"] as const;
export const validationStatusValues = [
	"pending",
	"validated",
	"failed",
	"suspended",
] as const;
export const webhookTypeValues = [
	"check",
	"pay",
	"fail",
	"confirm",
	"refund",
	"cancel",
] as const;
export const webhookEventStatusValues = [
	"received",
	"authenticated",
	"processed",
	"failed",
	"rejected",
] as const;
export const bookingSourceValues = [
	"manual",
	"web",
	"telegram",
	"partner",
	"api",
	"calendar_sync",
] as const;
export const bookingStatusValues = [
	"pending",
	"awaiting_payment",
	"confirmed",
	"in_progress",
	"completed",
	"cancelled",
	"rejected",
	"no_show",
	"disputed",
] as const;
export const bookingPaymentStatusValues = [
	"unpaid",
	"pending",
	"partially_paid",
	"paid",
	"refunded",
	"failed",
] as const;
export const calendarSyncStatusValues = [
	"pending",
	"linked",
	"sync_error",
	"detached",
	"not_applicable",
] as const;
export const discountTypeValues = ["percentage", "fixed_cents"] as const;
export const bookingPaymentAttemptStatusValues = [
	"initiated",
	"requires_action",
	"authorized",
	"captured",
	"failed",
	"cancelled",
	"refunded",
] as const;
export const shiftRequestInitiatorRoleValues = ["customer", "manager"] as const;
export const shiftRequestStatusValues = [
	"pending",
	"approved",
	"rejected",
	"applied",
	"cancelled",
] as const;
export const shiftRequestDecisionValues = [
	"pending",
	"approved",
	"rejected",
] as const;
export const paymentAdjustmentStatusValues = [
	"none",
	"pending",
	"captured",
	"refunded",
	"failed",
] as const;
export const disputeStatusValues = [
	"open",
	"under_review",
	"resolved",
	"rejected",
] as const;
export const refundStatusValues = [
	"requested",
	"approved",
	"processed",
	"failed",
	"rejected",
] as const;
export const reviewStatusValues = [
	"pending",
	"published",
	"hidden",
	"flagged",
] as const;
export const listingAssetKindValues = ["image", "document", "other"] as const;

export const cancellationRequestStatusValues = [
	"requested",
	"pending_review",
	"approved",
	"rejected",
	"applied",
	"cancelled",
] as const;

export const staffAssignmentRoleValues = [
	"primary",
	"backup",
	"assistant",
] as const;

export const cancellationPolicyScopeValues = [
	"listing",
	"organization",
] as const;

export const listingStatusEnum = pgEnum("listing_status", listingStatusValues);
export const publicationChannelTypeEnum = pgEnum(
	"publication_channel_type",
	publicationChannelTypeValues
);
export const publicationVisibilityEnum = pgEnum(
	"publication_visibility",
	publicationVisibilityValues
);
export const merchantTypeEnum = pgEnum("merchant_type", merchantTypeValues);
export const paymentProviderEnum = pgEnum(
	"payment_provider",
	paymentProviderValues
);
export const validationStatusEnum = pgEnum(
	"validation_status",
	validationStatusValues
);
export const webhookTypeEnum = pgEnum("webhook_type", webhookTypeValues);
export const webhookEventStatusEnum = pgEnum(
	"webhook_event_status",
	webhookEventStatusValues
);
export const bookingSourceEnum = pgEnum("booking_source", bookingSourceValues);
export const bookingStatusEnum = pgEnum("booking_status", bookingStatusValues);
export const bookingPaymentStatusEnum = pgEnum(
	"booking_payment_status",
	bookingPaymentStatusValues
);
export const calendarSyncStatusEnum = pgEnum(
	"calendar_sync_status",
	calendarSyncStatusValues
);
export const discountTypeEnum = pgEnum("discount_type", discountTypeValues);
export const bookingPaymentAttemptStatusEnum = pgEnum(
	"booking_payment_attempt_status",
	bookingPaymentAttemptStatusValues
);
export const shiftRequestInitiatorRoleEnum = pgEnum(
	"shift_request_initiator_role",
	shiftRequestInitiatorRoleValues
);
export const shiftRequestStatusEnum = pgEnum(
	"shift_request_status",
	shiftRequestStatusValues
);
export const shiftRequestDecisionEnum = pgEnum(
	"shift_request_decision",
	shiftRequestDecisionValues
);
export const paymentAdjustmentStatusEnum = pgEnum(
	"payment_adjustment_status",
	paymentAdjustmentStatusValues
);
export const disputeStatusEnum = pgEnum("dispute_status", disputeStatusValues);
export const refundStatusEnum = pgEnum("refund_status", refundStatusValues);
export const reviewStatusEnum = pgEnum("review_status", reviewStatusValues);
export const listingAssetKindEnum = pgEnum(
	"listing_asset_kind",
	listingAssetKindValues
);
export const cancellationRequestStatusEnum = pgEnum(
	"cancellation_request_status",
	cancellationRequestStatusValues
);
export const staffAssignmentRoleEnum = pgEnum(
	"staff_assignment_role",
	staffAssignmentRoleValues
);
export const cancellationPolicyScopeEnum = pgEnum(
	"cancellation_policy_scope",
	cancellationPolicyScopeValues
);

export const organizationSettings = pgTable(
	"organization_settings",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		timezone: text("timezone").notNull().default("UTC"),
		defaultCurrency: text("default_currency").notNull().default("RUB"),
		defaultLanguage: text("default_language").notNull().default("ru"),
		searchLanguage: text("search_language").notNull().default("russian"),
		businessHoursStart: integer("business_hours_start").notNull().default(9),
		businessHoursEnd: integer("business_hours_end").notNull().default(21),
		cancellationFreeWindowHours: integer("cancellation_free_window_hours")
			.notNull()
			.default(24),
		cancellationPenaltyBps: integer("cancellation_penalty_bps")
			.notNull()
			.default(0),
		bookingRequiresApproval: boolean("booking_requires_approval")
			.notNull()
			.default(false),
		contactEmail: text("contact_email"),
		contactPhone: text("contact_phone"),
		websiteUrl: text("website_url"),
		brandConfig: jsonb("brand_config").$type<Record<string, unknown>>(),
		notificationDefaults: jsonb("notification_defaults").$type<
			Record<string, unknown>
		>(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("organization_settings_uq_organization_id").on(
			table.organizationId
		),
	]
);

export const listingTypeConfig = pgTable(
	"listing_type_config",
	{
		id: text("id").primaryKey(),
		slug: text("slug").notNull(),
		label: text("label").notNull(),
		icon: text("icon"),
		metadataJsonSchema: jsonb("metadata_json_schema")
			.$type<Record<string, unknown>>()
			.notNull(),
		defaultAmenityKeys: jsonb("default_amenity_keys").$type<string[]>(),
		requiredFields: jsonb("required_fields").$type<string[]>(),
		supportedPricingModels: jsonb("supported_pricing_models").$type<string[]>(),
		isActive: boolean("is_active").notNull().default(true),
		sortOrder: integer("sort_order").notNull().default(0),
		...timestamps,
	},
	(table) => [uniqueIndex("listing_type_config_uq_slug").on(table.slug)]
);

export const organizationListingType = pgTable(
	"organization_listing_type",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		listingTypeSlug: text("listing_type_slug")
			.notNull()
			.references(() => listingTypeConfig.slug, { onDelete: "cascade" }),
		isDefault: boolean("is_default").notNull().default(false),
		config: jsonb("config").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("organization_listing_type_ix_organization_id").on(
			table.organizationId
		),
		uniqueIndex("organization_listing_type_uq_org_slug").on(
			table.organizationId,
			table.listingTypeSlug
		),
	]
);

export const listingLocation = pgTable(
	"listing_location",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		address: text("address"),
		latitude: doublePrecision("latitude"),
		longitude: doublePrecision("longitude"),
		timezone: text("timezone"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("listing_location_ix_organization_id").on(table.organizationId),
	]
);

export const listing = pgTable(
	"listing",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		listingTypeSlug: text("listing_type_slug")
			.notNull()
			.references(() => listingTypeConfig.slug, { onDelete: "restrict" }),
		locationId: text("location_id").references(() => listingLocation.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		minimumDurationMinutes: integer("minimum_duration_minutes")
			.notNull()
			.default(60),
		minimumNoticeMinutes: integer("minimum_notice_minutes")
			.notNull()
			.default(0),
		allowShiftRequests: boolean("allow_shift_requests").notNull().default(true),
		workingHoursStart: integer("working_hours_start").notNull().default(9),
		workingHoursEnd: integer("working_hours_end").notNull().default(21),
		timezone: text("timezone").notNull().default("UTC"),
		status: listingStatusEnum("status").notNull().default("draft"),
		isActive: boolean("is_active").notNull().default(true),
		approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
		archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
		...timestamps,
	},
	(table) => [
		index("listing_ix_organization_id").on(table.organizationId),
		index("listing_ix_status").on(table.status),
		index("listing_ix_listing_type_slug").on(table.listingTypeSlug),
		uniqueIndex("listing_uq_org_slug").on(table.organizationId, table.slug),
	]
);

export const listingAmenity = pgTable(
	"listing_amenity",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		label: text("label").notNull(),
		isEnabled: boolean("is_enabled").notNull().default(true),
		value: text("value"),
		...timestamps,
	},
	(table) => [
		index("listing_amenity_ix_listing_id").on(table.listingId),
		uniqueIndex("listing_amenity_uq_listing_key").on(
			table.listingId,
			table.key
		),
	]
);

export const listingAsset = pgTable(
	"listing_asset",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		kind: listingAssetKindEnum("kind").notNull().default("image"),
		storageKey: text("storage_key").notNull(),
		mimeType: text("mime_type"),
		altText: text("alt_text"),
		isPrimary: boolean("is_primary").notNull().default(false),
		sortOrder: integer("sort_order").notNull().default(0),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("listing_asset_ix_listing_id").on(table.listingId),
		index("listing_asset_ix_kind").on(table.kind),
	]
);

export const listingPricingProfile = pgTable(
	"listing_pricing_profile",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		currency: text("currency").notNull(),
		baseHourlyPriceCents: integer("base_hourly_price_cents").notNull(),
		minimumHours: integer("minimum_hours").notNull().default(1),
		depositBps: integer("deposit_bps").notNull().default(0),
		serviceFeeBps: integer("service_fee_bps").notNull().default(0),
		affiliateFeeBps: integer("affiliate_fee_bps").notNull().default(0),
		taxBps: integer("tax_bps").notNull().default(0),
		acquiringFeeBps: integer("acquiring_fee_bps").notNull().default(0),
		validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }),
		validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
		isDefault: boolean("is_default").notNull().default(false),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
		...timestamps,
	},
	(table) => [
		index("listing_pricing_profile_ix_listing_id").on(table.listingId),
		index("listing_pricing_profile_ix_is_default").on(table.isDefault),
	]
);

export const listingPricingRule = pgTable(
	"listing_pricing_rule",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		pricingProfileId: text("pricing_profile_id")
			.notNull()
			.references(() => listingPricingProfile.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		ruleType: text("rule_type").notNull(),
		conditionJson: jsonb("condition_json")
			.$type<Record<string, unknown>>()
			.notNull(),
		adjustmentType: text("adjustment_type").notNull(),
		adjustmentValue: integer("adjustment_value").notNull(),
		priority: integer("priority").notNull().default(0),
		isActive: boolean("is_active").notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("listing_pricing_rule_ix_listing_id").on(table.listingId),
		index("listing_pricing_rule_ix_pricing_profile_id").on(
			table.pricingProfileId
		),
	]
);

export const platformFeeConfig = pgTable(
	"platform_fee_config",
	{
		id: text("id").primaryKey(),
		currency: text("currency").notNull(),
		platformFeeBps: integer("platform_fee_bps").notNull().default(0),
		affiliateFeeBps: integer("affiliate_fee_bps").notNull().default(0),
		taxBps: integer("tax_bps").notNull().default(0),
		acquiringFeeBps: integer("acquiring_fee_bps").notNull().default(0),
		isActive: boolean("is_active").notNull().default(true),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(table) => [
		index("platform_fee_config_ix_currency").on(table.currency),
		index("platform_fee_config_ix_is_active").on(table.isActive),
	]
);

export const paymentProviderConfig = pgTable(
	"payment_provider_config",
	{
		id: text("id").primaryKey(),
		provider: paymentProviderEnum("provider").notNull(),
		displayName: text("display_name").notNull(),
		description: text("description"),
		isActive: boolean("is_active").notNull().default(true),
		supportedCurrencies: jsonb("supported_currencies")
			.$type<string[]>()
			.notNull(),
		defaultAcquiringFeeBps: integer("default_acquiring_fee_bps")
			.notNull()
			.default(0),
		defaultPlatformFeeBps: integer("default_platform_fee_bps")
			.notNull()
			.default(0),
		minPlatformFeeBps: integer("min_platform_fee_bps").notNull().default(0),
		configSchema: jsonb("config_schema").$type<Record<string, unknown>>(),
		sandboxAvailable: boolean("sandbox_available").notNull().default(false),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("payment_provider_config_uq_provider").on(table.provider),
	]
);

export const organizationPaymentConfig = pgTable(
	"organization_payment_config",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		providerConfigId: text("provider_config_id")
			.notNull()
			.references(() => paymentProviderConfig.id, { onDelete: "restrict" }),
		provider: paymentProviderEnum("provider").notNull(),
		isActive: boolean("is_active").notNull().default(false),
		publicKey: text("public_key"),
		encryptedCredentials: text("encrypted_credentials").notNull(),
		credentialKeyVersion: integer("credential_key_version")
			.notNull()
			.default(1),
		webhookEndpointId: text("webhook_endpoint_id").notNull(),
		validatedAt: timestamp("validated_at", {
			withTimezone: true,
			mode: "date",
		}),
		validationStatus: validationStatusEnum("validation_status")
			.notNull()
			.default("pending"),
		platformServiceFeeBps: integer("platform_service_fee_bps"),
		payoutConfig: jsonb("payout_config").$type<Record<string, unknown>>(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("organization_payment_config_ix_organization_id").on(
			table.organizationId
		),
		uniqueIndex("organization_payment_config_uq_org_provider").on(
			table.organizationId,
			table.provider
		),
		uniqueIndex("organization_payment_config_uq_webhook_endpoint_id").on(
			table.webhookEndpointId
		),
	]
);

export const paymentWebhookEvent = pgTable(
	"payment_webhook_event",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		endpointId: text("endpoint_id").notNull(),
		provider: paymentProviderEnum("provider").notNull(),
		webhookType: webhookTypeEnum("webhook_type").notNull(),
		status: webhookEventStatusEnum("status").notNull().default("received"),
		requestSignature: text("request_signature"),
		payload: jsonb("payload").$type<Record<string, unknown>>(),
		responseCode: integer("response_code"),
		errorMessage: text("error_message"),
		processingDurationMs: integer("processing_duration_ms"),
		...timestamps,
	},
	(table) => [
		index("payment_webhook_event_ix_organization_id_created_at").on(
			table.organizationId,
			table.createdAt
		),
		index("payment_webhook_event_ix_endpoint_id").on(table.endpointId),
	]
);

export const listingPublication = pgTable(
	"listing_publication",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		channelType: publicationChannelTypeEnum("channel_type").notNull(),
		channelId: text("channel_id"),
		isActive: boolean("is_active").notNull().default(true),
		visibility: publicationVisibilityEnum("visibility")
			.notNull()
			.default("public"),
		merchantType: merchantTypeEnum("merchant_type")
			.notNull()
			.default("platform"),
		merchantPaymentConfigId: text("merchant_payment_config_id").references(
			() => organizationPaymentConfig.id,
			{ onDelete: "set null" }
		),
		platformFeeBps: integer("platform_fee_bps"),
		pricingProfileId: text("pricing_profile_id").references(
			() => listingPricingProfile.id,
			{ onDelete: "set null" }
		),
		displayConfig: jsonb("display_config").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("listing_publication_ix_listing_id").on(table.listingId),
		index("listing_publication_ix_organization_id").on(table.organizationId),
		index("listing_publication_ix_channel_type").on(table.channelType),
		uniqueIndex("listing_publication_uq_listing_channel").on(
			table.listingId,
			table.channelType,
			table.channelId
		),
	]
);

export const booking = pgTable(
	"booking",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "restrict" }),
		publicationId: text("publication_id")
			.notNull()
			.references(() => listingPublication.id, { onDelete: "restrict" }),
		merchantOrganizationId: text("merchant_organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "restrict" }),
		merchantPaymentConfigId: text("merchant_payment_config_id").references(
			() => organizationPaymentConfig.id,
			{ onDelete: "set null" }
		),
		customerUserId: text("customer_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		source: bookingSourceEnum("source").notNull(),
		status: bookingStatusEnum("status").notNull().default("pending"),
		paymentStatus: bookingPaymentStatusEnum("payment_status")
			.notNull()
			.default("unpaid"),
		calendarSyncStatus: calendarSyncStatusEnum("calendar_sync_status")
			.notNull()
			.default("pending"),
		startsAt: timestamp("starts_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		endsAt: timestamp("ends_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		passengers: integer("passengers"),
		contactName: text("contact_name"),
		contactPhone: text("contact_phone"),
		contactEmail: text("contact_email"),
		timezone: text("timezone"),
		basePriceCents: integer("base_price_cents").notNull(),
		discountAmountCents: integer("discount_amount_cents").notNull().default(0),
		totalPriceCents: integer("total_price_cents").notNull(),
		platformCommissionCents: integer("platform_commission_cents")
			.notNull()
			.default(0),
		currency: text("currency").notNull(),
		notes: text("notes"),
		specialRequests: text("special_requests"),
		externalRef: text("external_ref"),
		cancelledAt: timestamp("cancelled_at", {
			withTimezone: true,
			mode: "date",
		}),
		cancelledByUserId: text("cancelled_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		cancellationReason: text("cancellation_reason"),
		refundAmountCents: integer("refund_amount_cents").notNull().default(0),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("booking_ix_organization_id").on(table.organizationId),
		index("booking_ix_listing_id").on(table.listingId),
		index("booking_ix_customer_user_id").on(table.customerUserId),
		index("booking_ix_status").on(table.status),
		index("booking_ix_payment_status").on(table.paymentStatus),
		index("booking_ix_starts_at").on(table.startsAt),
		uniqueIndex("booking_uq_org_source_external_ref").on(
			table.organizationId,
			table.source,
			table.externalRef
		),
	]
);

export const bookingDiscountCode = pgTable(
	"booking_discount_code",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		code: text("code").notNull(),
		name: text("name").notNull(),
		description: text("description"),
		discountType: discountTypeEnum("discount_type").notNull(),
		discountValue: integer("discount_value").notNull(),
		maxDiscountCents: integer("max_discount_cents"),
		minimumSubtotalCents: integer("minimum_subtotal_cents")
			.notNull()
			.default(0),
		validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }),
		validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
		usageLimit: integer("usage_limit"),
		usageCount: integer("usage_count").notNull().default(0),
		perCustomerLimit: integer("per_customer_limit"),
		appliesToListingId: text("applies_to_listing_id").references(
			() => listing.id,
			{ onDelete: "set null" }
		),
		isActive: boolean("is_active").notNull().default(true),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("booking_discount_code_ix_organization_id_is_active").on(
			table.organizationId,
			table.isActive
		),
		uniqueIndex("booking_discount_code_uq_org_code").on(
			table.organizationId,
			table.code
		),
	]
);

export const bookingDiscountApplication = pgTable(
	"booking_discount_application",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		discountCodeId: text("discount_code_id")
			.notNull()
			.references(() => bookingDiscountCode.id, { onDelete: "restrict" }),
		customerUserId: text("customer_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		code: text("code").notNull(),
		appliedAmountCents: integer("applied_amount_cents").notNull(),
		...timestamps,
	},
	(table) => [
		index("booking_discount_application_ix_booking_id").on(table.bookingId),
		index("booking_discount_application_ix_discount_code_id").on(
			table.discountCodeId
		),
		uniqueIndex("booking_discount_application_uq_booking_id").on(
			table.bookingId
		),
	]
);

export const bookingPaymentAttempt = pgTable(
	"booking_payment_attempt",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		provider: text("provider").notNull().default("manual"),
		idempotencyKey: text("idempotency_key").notNull(),
		providerIntentId: text("provider_intent_id"),
		status: bookingPaymentAttemptStatusEnum("status")
			.notNull()
			.default("initiated"),
		amountCents: integer("amount_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		failureReason: text("failure_reason"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		processedAt: timestamp("processed_at", {
			withTimezone: true,
			mode: "date",
		}),
		...timestamps,
	},
	(table) => [
		index("booking_payment_attempt_ix_booking_id").on(table.bookingId),
		index("booking_payment_attempt_ix_organization_id").on(
			table.organizationId
		),
		index("booking_payment_attempt_ix_status").on(table.status),
		uniqueIndex("booking_payment_attempt_uq_booking_idempotency").on(
			table.bookingId,
			table.idempotencyKey
		),
		uniqueIndex("booking_payment_attempt_uq_provider_intent").on(
			table.provider,
			table.providerIntentId
		),
	]
);

export const bookingShiftRequest = pgTable(
	"booking_shift_request",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		initiatedByRole:
			shiftRequestInitiatorRoleEnum("initiated_by_role").notNull(),
		status: shiftRequestStatusEnum("status").notNull().default("pending"),
		customerDecision: shiftRequestDecisionEnum("customer_decision")
			.notNull()
			.default("pending"),
		customerDecisionByUserId: text("customer_decision_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		customerDecisionAt: timestamp("customer_decision_at", {
			withTimezone: true,
			mode: "date",
		}),
		customerDecisionNote: text("customer_decision_note"),
		managerDecision: shiftRequestDecisionEnum("manager_decision")
			.notNull()
			.default("pending"),
		managerDecisionByUserId: text("manager_decision_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		managerDecisionAt: timestamp("manager_decision_at", {
			withTimezone: true,
			mode: "date",
		}),
		managerDecisionNote: text("manager_decision_note"),
		currentStartsAt: timestamp("current_starts_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		currentEndsAt: timestamp("current_ends_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		proposedStartsAt: timestamp("proposed_starts_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		proposedEndsAt: timestamp("proposed_ends_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		currentPassengers: integer("current_passengers").notNull(),
		proposedPassengers: integer("proposed_passengers").notNull(),
		currentBasePriceCents: integer("current_base_price_cents")
			.notNull()
			.default(0),
		currentDiscountAmountCents: integer("current_discount_amount_cents")
			.notNull()
			.default(0),
		currentTotalPriceCents: integer("current_total_price_cents")
			.notNull()
			.default(0),
		currentPayNowCents: integer("current_pay_now_cents").notNull().default(0),
		proposedBasePriceCents: integer("proposed_base_price_cents")
			.notNull()
			.default(0),
		proposedDiscountAmountCents: integer("proposed_discount_amount_cents")
			.notNull()
			.default(0),
		proposedTotalPriceCents: integer("proposed_total_price_cents")
			.notNull()
			.default(0),
		proposedPayNowCents: integer("proposed_pay_now_cents").notNull().default(0),
		priceDeltaCents: integer("price_delta_cents").notNull().default(0),
		payNowDeltaCents: integer("pay_now_delta_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		discountCode: text("discount_code"),
		reason: text("reason"),
		rejectedByUserId: text("rejected_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		rejectedAt: timestamp("rejected_at", { withTimezone: true, mode: "date" }),
		rejectionReason: text("rejection_reason"),
		appliedByUserId: text("applied_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
		paymentAdjustmentStatus: paymentAdjustmentStatusEnum(
			"payment_adjustment_status"
		)
			.notNull()
			.default("none"),
		paymentAdjustmentAmountCents: integer("payment_adjustment_amount_cents")
			.notNull()
			.default(0),
		paymentAdjustmentReference: text("payment_adjustment_reference"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
			.default(sql`now()`)
			.notNull(),
		...timestamps,
	},
	(table) => [
		index("booking_shift_request_ix_organization_id").on(table.organizationId),
		index("booking_shift_request_ix_status").on(table.status),
		uniqueIndex("booking_shift_request_uq_booking_id").on(table.bookingId),
	]
);

export const bookingDispute = pgTable(
	"booking_dispute",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		raisedByUserId: text("raised_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		status: disputeStatusEnum("status").notNull().default("open"),
		reasonCode: text("reason_code"),
		details: text("details"),
		resolution: text("resolution"),
		resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
		...timestamps,
	},
	(table) => [
		index("booking_dispute_ix_booking_id").on(table.bookingId),
		index("booking_dispute_ix_organization_id").on(table.organizationId),
		index("booking_dispute_ix_status").on(table.status),
	]
);

export const bookingRefund = pgTable(
	"booking_refund",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedByUserId: text("approved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		processedByUserId: text("processed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		status: refundStatusEnum("status").notNull().default("requested"),
		amountCents: integer("amount_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		reason: text("reason"),
		provider: text("provider"),
		externalRefundId: text("external_refund_id"),
		failureReason: text("failure_reason"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
			.default(sql`now()`)
			.notNull(),
		approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
		processedAt: timestamp("processed_at", {
			withTimezone: true,
			mode: "date",
		}),
		...timestamps,
	},
	(table) => [
		index("booking_refund_ix_booking_id").on(table.bookingId),
		index("booking_refund_ix_organization_id").on(table.organizationId),
		index("booking_refund_ix_status").on(table.status),
		uniqueIndex("booking_refund_uq_provider_external_refund_id").on(
			table.provider,
			table.externalRefundId
		),
	]
);

export const listingReview = pgTable(
	"listing_review",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		reviewerUserId: text("reviewer_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		rating: integer("rating").notNull(),
		title: text("title"),
		body: text("body"),
		status: reviewStatusEnum("status").notNull().default("pending"),
		publishedAt: timestamp("published_at", {
			withTimezone: true,
			mode: "date",
		}),
		moderatedByUserId: text("moderated_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		moderatedAt: timestamp("moderated_at", {
			withTimezone: true,
			mode: "date",
		}),
		moderationNote: text("moderation_note"),
		...timestamps,
	},
	(table) => [
		index("listing_review_ix_listing_id_status").on(
			table.listingId,
			table.status
		),
		index("listing_review_ix_organization_id").on(table.organizationId),
		index("listing_review_ix_reviewer_user_id").on(table.reviewerUserId),
		uniqueIndex("listing_review_uq_booking_id").on(table.bookingId),
	]
);

export const listingReviewResponse = pgTable(
	"listing_review_response",
	{
		id: text("id").primaryKey(),
		reviewId: text("review_id")
			.notNull()
			.references(() => listingReview.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		body: text("body").notNull(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("listing_review_response_uq_review_id").on(table.reviewId),
	]
);

/**
 * Staff assignment to a listing — which org members can operate this listing.
 * A listing can have multiple assigned staff; each has a role (primary, backup, assistant).
 */
export const listingStaffAssignment = pgTable(
	"listing_staff_assignment",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		memberId: text("member_id")
			.notNull()
			.references(() => member.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		role: staffAssignmentRoleEnum("role").notNull().default("primary"),
		isActive: boolean("is_active").notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("listing_staff_assignment_ix_listing_id").on(table.listingId),
		index("listing_staff_assignment_ix_member_id").on(table.memberId),
		index("listing_staff_assignment_ix_organization_id").on(
			table.organizationId
		),
		uniqueIndex("listing_staff_assignment_uq_listing_member").on(
			table.listingId,
			table.memberId
		),
	]
);

/**
 * Staff assignment to a specific booking — who is responsible for fulfilling this booking.
 * Can be auto-populated from listing staff or manually assigned.
 */
export const bookingStaffAssignment = pgTable(
	"booking_staff_assignment",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		memberId: text("member_id")
			.notNull()
			.references(() => member.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		role: staffAssignmentRoleEnum("role").notNull().default("primary"),
		assignedByUserId: text("assigned_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(table) => [
		index("booking_staff_assignment_ix_booking_id").on(table.bookingId),
		index("booking_staff_assignment_ix_member_id").on(table.memberId),
		index("booking_staff_assignment_ix_organization_id").on(
			table.organizationId
		),
		uniqueIndex("booking_staff_assignment_uq_booking_member").on(
			table.bookingId,
			table.memberId
		),
	]
);

/**
 * Cancellation request — dual-approval workflow mirroring bookingShiftRequest.
 * Customer or manager initiates → other party reviews → both approve → booking cancelled + refund.
 * Keeps full refund calculation snapshot at request time.
 */
export const bookingCancellationRequest = pgTable(
	"booking_cancellation_request",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		initiatedByRole:
			shiftRequestInitiatorRoleEnum("initiated_by_role").notNull(),
		status: cancellationRequestStatusEnum("status")
			.notNull()
			.default("requested"),
		reason: text("reason"),
		reasonCode: text("reason_code"),
		/** Customer's decision on the cancellation. */
		customerDecision: shiftRequestDecisionEnum("customer_decision")
			.notNull()
			.default("pending"),
		customerDecisionByUserId: text("customer_decision_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		customerDecisionAt: timestamp("customer_decision_at", {
			withTimezone: true,
			mode: "date",
		}),
		customerDecisionNote: text("customer_decision_note"),
		/** Manager's decision on the cancellation. */
		managerDecision: shiftRequestDecisionEnum("manager_decision")
			.notNull()
			.default("pending"),
		managerDecisionByUserId: text("manager_decision_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		managerDecisionAt: timestamp("manager_decision_at", {
			withTimezone: true,
			mode: "date",
		}),
		managerDecisionNote: text("manager_decision_note"),
		/** Snapshot of booking financials at request time. */
		bookingTotalPriceCents: integer("booking_total_price_cents")
			.notNull()
			.default(0),
		penaltyAmountCents: integer("penalty_amount_cents").notNull().default(0),
		refundAmountCents: integer("refund_amount_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		/** Refund processing status after approval. */
		refundStatus: refundStatusEnum("refund_status"),
		refundReference: text("refund_reference"),
		appliedByUserId: text("applied_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
		requestedAt: timestamp("requested_at", {
			withTimezone: true,
			mode: "date",
		})
			.default(sql`now()`)
			.notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("booking_cancellation_request_ix_organization_id").on(
			table.organizationId
		),
		index("booking_cancellation_request_ix_status").on(table.status),
		uniqueIndex("booking_cancellation_request_uq_booking_id").on(
			table.bookingId
		),
	]
);

/**
 * Cancellation policy — can be scoped to a listing or fall back to organization-wide.
 * Organization-level policy serves as default; listing-level overrides when present.
 */
export const cancellationPolicy = pgTable(
	"cancellation_policy",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		listingId: text("listing_id").references(() => listing.id, {
			onDelete: "cascade",
		}),
		scope: cancellationPolicyScopeEnum("scope").notNull(),
		name: text("name").notNull(),
		/** Hours before booking start when free cancellation is allowed. */
		freeWindowHours: integer("free_window_hours").notNull().default(24),
		/** Penalty in basis points of total price if cancelled inside the free window. 10000 = 100%. */
		penaltyBps: integer("penalty_bps").notNull().default(0),
		/** Basis points charged if cancelled with very short notice (e.g. < 2h). 10000 = 100%. */
		latePenaltyBps: integer("late_penalty_bps").notNull().default(10_000),
		/** Hours threshold for late penalty (cancellations within this window). */
		latePenaltyWindowHours: integer("late_penalty_window_hours")
			.notNull()
			.default(2),
		/** Whether no-shows are charged the full amount. */
		noShowFullCharge: boolean("no_show_full_charge").notNull().default(true),
		isActive: boolean("is_active").notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("cancellation_policy_ix_organization_id").on(table.organizationId),
		index("cancellation_policy_ix_listing_id").on(table.listingId),
		uniqueIndex("cancellation_policy_uq_listing_id").on(table.listingId),
		uniqueIndex("cancellation_policy_uq_org_scope").on(
			table.organizationId,
			table.scope
		),
	]
);
