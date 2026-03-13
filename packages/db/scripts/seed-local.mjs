#!/usr/bin/env node

import { parseArgs } from "node:util";
import process from "node:process";

import { hashPassword } from "better-auth/crypto";
import pg from "pg";

import { CLEANUP_TABLES } from "./cleanup-tables.mjs";

const { Client } = pg;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_ANCHOR_DATE = "2026-03-15";
const ANCHOR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TODO_ID_MIN = 900_000;
const TODO_ID_MAX = 900_999;
const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/myapp";
const SEED_MARKER_ORGANIZATION_ID = "seed_org_admin";

const quote = (identifier) => `"${identifier}"`;

const parseCliArgs = () => {
	const { values } = parseArgs({
		options: {
			"anchor-date": { type: "string", default: DEFAULT_ANCHOR_DATE },
			append: { type: "boolean", default: false },
			"database-url": { type: "string" },
			help: { type: "boolean", short: "h" },
			profile: { type: "string", default: "default" },
			"skip-if-present": { type: "boolean", default: false },
		},
		strict: true,
	});

	if (values.help) {
		console.log(
			[
				"Usage: bun run db:seed -- [options]",
				"",
				"Options:",
				`  --anchor-date <YYYY-MM-DD>  Stable UTC anchor date (default: ${DEFAULT_ANCHOR_DATE})`,
				"  --append                    Do not clear prior seed namespace before writing",
				"  --profile <default|calendar-integration>  Extra fixture profile to append",
				"  --skip-if-present           Exit successfully when the demo seed namespace already exists",
				"  --database-url <url>        PostgreSQL connection string (default: DATABASE_URL env or localhost)",
				"  -h, --help                  Show this help message",
			].join("\n")
		);
		process.exit(0);
	}

	return {
		anchorDate: values["anchor-date"],
		append: values.append ?? false,
		databaseUrl: values["database-url"] ?? null,
		profile: values.profile ?? "default",
		skipIfPresent: values["skip-if-present"] ?? false,
	};
};

const parseAnchorDate = (value) => {
	if (!ANCHOR_DATE_RE.test(value)) {
		throw new Error("--anchor-date must use YYYY-MM-DD format");
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error("--anchor-date is not a valid date");
	}
	return parsed.getTime();
};

const toJson = (value) => JSON.stringify(value);

const withCommon = (rows, now) =>
	rows.map((row) => ({
		created_at: now,
		updated_at: now,
		...row,
	}));

const buildSeedData = ({
	anchorDate,
	adminPasswordHash,
	operatorPasswordHash,
	profile = "default",
}) => {
	const anchorDateMs = parseAnchorDate(anchorDate);
	const nowMs = anchorDateMs + 9 * HOUR_MS;
	const now = new Date(nowMs).toISOString();
	const inTwoDays = new Date(nowMs + 2 * DAY_MS).toISOString();

	const adminOrgId = "seed_org_admin";
	const starterOrgId = "seed_org_starter";
	const adminUserId = "seed_user_admin";
	const operatorUserId = "seed_user_operator";
	const memberUserId = "seed_user_member";
	const boatTypeId = "seed_listing_type_boat_charter";
	const boatTypeSlug = "seed-boat-charter";
	const excursionTypeId = "seed_listing_type_walking_tour";
	const excursionTypeSlug = "seed-walking-tour";
	const boatLocationId = "seed_listing_location_marina";
	const excursionLocationId = "seed_listing_location_center";
	const boatListingId = "seed_listing_boat_1";
	const excursionListingId = "seed_listing_excursion_1";
	const boatPricingProfileId = "seed_pricing_boat_default";
	const excursionPricingProfileId = "seed_pricing_excursion_default";
	const boatCalendarConnectionId = "seed_calendar_connection_boat_primary";
	const boatCalendarAccountId = "seed_calendar_account_boat_google";
	const boatPrimaryCalendarSourceId = "seed_calendar_source_boat_primary";
	const boatBackupCalendarSourceId = "seed_calendar_source_boat_backup";
	const boatMarketplacePublicationId = "seed_publication_boat_marketplace";
	const boatOwnSitePublicationId = "seed_publication_boat_own_site";
	const excursionMarketplacePublicationId = "seed_publication_excursion_marketplace";
	const boatDiscountCodeId = "seed_discount_code_spring10";

	const boatBookingStartsAt = new Date(
		anchorDateMs + 2 * DAY_MS + 10 * HOUR_MS,
	).toISOString();
	const boatBookingEndsAt = new Date(
		anchorDateMs + 2 * DAY_MS + 14 * HOUR_MS,
	).toISOString();
	const boatCalendarBlockStartsAt = new Date(
		anchorDateMs + 1 * DAY_MS + 12 * HOUR_MS,
	).toISOString();
	const boatCalendarBlockEndsAt = new Date(
		anchorDateMs + 1 * DAY_MS + 13 * HOUR_MS,
	).toISOString();
	const exceptionDate = new Date(anchorDateMs + 3 * DAY_MS)
		.toISOString()
		.slice(0, 10);

	const everydayWeekdays = [0, 1, 2, 3, 4, 5, 6];
	const boatAvailabilityRules = everydayWeekdays.map((dayOfWeek) => ({
		id: `seed_availability_rule_boat_${dayOfWeek}`,
		listing_id: boatListingId,
		day_of_week: dayOfWeek,
		start_minute: 9 * 60,
		end_minute: 18 * 60,
		is_active: true,
	}));
	const excursionAvailabilityRules = everydayWeekdays.map((dayOfWeek) => ({
		id: `seed_availability_rule_excursion_${dayOfWeek}`,
		listing_id: excursionListingId,
		day_of_week: dayOfWeek,
		start_minute: 10 * 60,
		end_minute: 17 * 60,
		is_active: true,
	}));

	const seed = {
		organizations: [
			{
				id: adminOrgId,
				name: "Admin",
				slug: "admin",
				logo: null,
				metadata: toJson({ seedNamespace: "seed" }),
				created_at: now,
			},
			{
				id: starterOrgId,
				name: "Starter Organization",
				slug: "starter-org",
				logo: null,
				metadata: toJson({ seedNamespace: "seed", tier: "pro" }),
				created_at: now,
			},
		],
		users: withCommon(
			[
				{
					id: adminUserId,
					name: "Admin",
					email: "admin@admin.com",
					email_verified: true,
					image: null,
					role: "admin",
				},
				{
					id: operatorUserId,
					name: "Operations User",
					email: "operator@example.com",
					email_verified: true,
					image: null,
					role: "user",
				},
				{
					id: memberUserId,
					name: "Member User",
					email: "member@example.com",
					email_verified: true,
					image: null,
					role: "user",
				},
			],
			now
		),
		accounts: withCommon(
			[
				{
					id: "seed_account_admin_credential",
					account_id: adminUserId,
					provider_id: "credential",
					user_id: adminUserId,
					password: adminPasswordHash,
				},
				{
					id: "seed_account_operator_credential",
					account_id: operatorUserId,
					provider_id: "credential",
					user_id: operatorUserId,
					password: operatorPasswordHash,
				},
			],
			now
		),
		members: [
			{
				id: "seed_member_admin",
				organization_id: adminOrgId,
				user_id: adminUserId,
				role: "org_owner",
				created_at: now,
			},
			{
				id: "seed_member_operator",
				organization_id: starterOrgId,
				user_id: operatorUserId,
				role: "manager",
				created_at: now,
			},
			{
				id: "seed_member_member",
				organization_id: starterOrgId,
				user_id: memberUserId,
				role: "member",
				created_at: now,
			},
		],
		invitations: [
			{
				id: "seed_invitation_pending",
				organization_id: starterOrgId,
				email: "invitee@example.com",
				role: "member",
				status: "pending",
				expires_at: inTwoDays,
				inviter_id: operatorUserId,
				created_at: now,
			},
		],
		consents: withCommon(
			[
				{
					id: "seed_consent_member_service",
					user_id: memberUserId,
					consent_type: "service_agreement",
					consent_version: "2026-02-14",
					consented_at: now,
					ip_address: "127.0.0.1",
					user_agent: "seed-local",
				},
			],
			now
		),
		notificationEvents: withCommon(
			[
				{
					id: "seed_notification_event_task_1",
					organization_id: starterOrgId,
					actor_user_id: operatorUserId,
					event_type: "task.recurring.tick",
					source_type: "task",
					source_id: "seed-task-1",
					idempotency_key: "seed:task:recurring:1",
					payload: {
						recipients: [
							{
								userId: memberUserId,
								title: "Recurring reminder",
								body: "This is a seeded recurring reminder.",
								channels: ["in_app"],
								severity: "info",
							},
						],
					},
					status: "processed",
					processing_started_at: now,
					processed_at: now,
					failure_reason: null,
				},
			],
			now
		),
		notificationIntents: withCommon(
			[
				{
					id: "seed_notification_intent_task_1",
					event_id: "seed_notification_event_task_1",
					organization_id: starterOrgId,
					recipient_user_id: memberUserId,
					channel: "in_app",
					template_key: "task.recurring.tick",
					title: "Recurring reminder",
					body: "This is a seeded recurring reminder.",
					metadata: { taskId: "seed-task-1", runNumber: 1 },
					status: "sent",
					processed_at: now,
				},
			],
			now
		),
		notificationDeliveries: withCommon(
			[
				{
					id: "seed_notification_delivery_task_1",
					intent_id: "seed_notification_intent_task_1",
					organization_id: starterOrgId,
					provider: "in_app",
					provider_recipient: memberUserId,
					attempt: 1,
					status: "sent",
					provider_message_id: "seed-in-app-1",
					failure_reason: null,
					response_payload: null,
					sent_at: now,
				},
			],
			now
		),
		notificationInApp: withCommon(
			[
				{
					id: "seed_notification_in_app_1",
					event_id: "seed_notification_event_task_1",
					intent_id: "seed_notification_intent_task_1",
					organization_id: starterOrgId,
					user_id: memberUserId,
					title: "Recurring reminder",
					body: "This is a seeded recurring reminder.",
					cta_url: "/dashboard",
					severity: "info",
					metadata: { taskId: "seed-task-1" },
					delivered_at: now,
					viewed_at: null,
				},
			],
			now
		),
		notificationPreferences: withCommon(
			[
				{
					id: "seed_notification_pref_member_global",
					user_id: memberUserId,
					organization_id: null,
					organization_scope_key: "global",
					event_type: "*",
					channel: "in_app",
					enabled: true,
					quiet_hours_start: null,
					quiet_hours_end: null,
					timezone: "UTC",
					created_by_user_id: adminUserId,
				},
			],
			now
		),
		todos: [
			{ id: 900_001, text: "Review org memberships", completed: false },
			{ id: 900_002, text: "Verify notification delivery", completed: false },
			{ id: 900_003, text: "Check recurring reminder pipeline", completed: true },
		],
		assistantChats: withCommon(
			[
				{
					id: "seed_chat_member_1",
					title: "Starter onboarding",
					user_id: memberUserId,
					visibility: "private",
				},
			],
			now
		),
		assistantMessages: withCommon(
			[
				{
					id: "seed_chat_message_member_1",
					chat_id: "seed_chat_member_1",
					role: "assistant",
					parts: toJson([
						{
							type: "text",
							text: "Welcome. This starter includes auth, notifications, payments, tasks, and todo flows.",
						},
					]),
					attachments: toJson([]),
				},
			],
			now
		),

		// ── Marketplace ──────────────────────────────────────────────────────────

		listingTypeConfigs: withCommon(
			[
				{
					id: boatTypeId,
					slug: boatTypeSlug,
					service_family: "boat_rent",
					label: "Boat charter",
					icon: "ship-wheel",
					metadata_json_schema: toJson({ type: "object", properties: {} }),
					default_amenity_keys: toJson([
						"captain",
						"life-jackets",
						"bluetooth-speakers",
					]),
					required_fields: toJson(["name", "slug", "timezone", "capacity"]),
					supported_pricing_models: toJson(["hourly"]),
					is_active: true,
					sort_order: 1,
				},
				{
					id: excursionTypeId,
					slug: excursionTypeSlug,
					service_family: "excursions",
					label: "Walking tour",
					icon: "map",
					metadata_json_schema: toJson({ type: "object", properties: {} }),
					default_amenity_keys: toJson(["guide", "tickets-included"]),
					required_fields: toJson([
						"name",
						"slug",
						"timezone",
						"meetingPoint",
						"durationMinutes",
					]),
					supported_pricing_models: toJson(["per_group", "per_person"]),
					is_active: true,
					sort_order: 2,
				},
			],
			now
		),
		organizationListingTypes: withCommon(
			[
				{
					id: "seed_org_listing_type_boat_default",
					organization_id: starterOrgId,
					listing_type_slug: boatTypeSlug,
					is_default: true,
					config: toJson({ featured: true }),
				},
				{
					id: "seed_org_listing_type_excursion",
					organization_id: starterOrgId,
					listing_type_slug: excursionTypeSlug,
					is_default: false,
					config: toJson({ featured: false }),
				},
			],
			now
		),
		orgSettings: withCommon(
			[
				{
					id: "seed_org_starter_settings",
					organization_id: starterOrgId,
					timezone: "Europe/Moscow",
					default_currency: "RUB",
					default_language: "ru",
					search_language: "russian",
					contact_email: "fleet@starter-org.example",
					contact_phone: "+7 900 000-00-00",
					website_url: "https://starter-org.example",
					brand_config: toJson({
						primaryColor: "#0f766e",
						accentColor: "#f97316",
					}),
				},
			],
			now
		),
		organizationOnboarding: withCommon(
			[
				{
					id: "seed_org_starter_onboarding",
					organization_id: starterOrgId,
					payment_configured: true,
					calendar_connected: true,
					listing_published: true,
					is_complete: true,
					completed_at: now,
					last_recalculated_at: now,
				},
			],
			now
		),
		listingLocations: withCommon(
			[
				{
					id: boatLocationId,
					organization_id: starterOrgId,
					name: "Sochi Marine Station",
					address: "1 Marine Station Square, Sochi",
					latitude: 43.58055,
					longitude: 39.71872,
					timezone: "Europe/Moscow",
					metadata: toJson({ kind: "marina" }),
				},
				{
					id: excursionLocationId,
					organization_id: starterOrgId,
					name: "Central Fountain",
					address: "Kurortny Prospekt, Sochi",
					latitude: 43.58547,
					longitude: 39.72306,
					timezone: "Europe/Moscow",
					metadata: toJson({ kind: "meeting_point" }),
				},
			],
			now
		),
		listings: withCommon(
			[
				{
					id: boatListingId,
					organization_id: starterOrgId,
					listing_type_slug: boatTypeSlug,
					location_id: boatLocationId,
					name: "Ocean Retreat",
					slug: "seed-ocean-retreat",
					description:
						"A flagship charter listing with calendar sync, special pricing, assets, and discounts ready for demo flows.",
					minimum_duration_minutes: 120,
					minimum_notice_minutes: 60,
					timezone: "Europe/Moscow",
					status: "active",
					is_active: true,
					approved_at: now,
				},
				{
					id: excursionListingId,
					organization_id: starterOrgId,
					listing_type_slug: excursionTypeSlug,
					location_id: excursionLocationId,
					name: "Historic Center Walk",
					slug: "seed-historic-center-walk",
					description:
						"A guided excursion listing showing how content-first experiences fit the same marketplace core.",
					minimum_duration_minutes: 180,
					minimum_notice_minutes: 30,
					timezone: "Europe/Moscow",
					status: "active",
					is_active: true,
					approved_at: now,
				},
			],
			now
		),
		listingBoatRentProfiles: withCommon(
			[
				{
					listing_id: boatListingId,
					organization_id: starterOrgId,
					capacity: 12,
					captain_mode: "captained_only",
					base_port: "Sochi Marine Station",
					departure_area: "Imeretinskaya Bay",
					fuel_policy: "included",
					deposit_required: true,
					instant_book_allowed: false,
				},
			],
			now
		),
		listingExcursionProfiles: withCommon(
			[
				{
					listing_id: excursionListingId,
					organization_id: starterOrgId,
					meeting_point: "Central Fountain",
					duration_minutes: 180,
					group_format: "both",
					max_group_size: 12,
					primary_language: "Russian",
					tickets_included: true,
					child_friendly: true,
					instant_book_allowed: true,
				},
			],
			now
		),
		listingAmenities: withCommon(
			[
				{
					id: "seed_listing_amenity_boat_captain",
					listing_id: boatListingId,
					key: "captain",
					label: "Captain included",
					is_enabled: true,
				},
				{
					id: "seed_listing_amenity_boat_life_jackets",
					listing_id: boatListingId,
					key: "life-jackets",
					label: "Life jackets",
					is_enabled: true,
				},
				{
					id: "seed_listing_amenity_boat_bluetooth",
					listing_id: boatListingId,
					key: "bluetooth-speakers",
					label: "Bluetooth speakers",
					is_enabled: true,
				},
				{
					id: "seed_listing_amenity_excursion_guide",
					listing_id: excursionListingId,
					key: "guide",
					label: "Professional guide",
					is_enabled: true,
				},
				{
					id: "seed_listing_amenity_excursion_tickets",
					listing_id: excursionListingId,
					key: "tickets-included",
					label: "Tickets included",
					is_enabled: true,
				},
			],
			now
		),
		listingAssets: withCommon(
			[
				{
					id: "seed_listing_asset_boat_primary",
					listing_id: boatListingId,
					kind: "image",
					storage_provider: "listing-public-v1",
					storage_key: "seed/boats/ocean-retreat/hero.jpg",
					access: "public",
					alt_text: "Ocean Retreat at Sochi marina",
					is_primary: true,
					sort_order: 0,
				},
				{
					id: "seed_listing_asset_boat_spec",
					listing_id: boatListingId,
					kind: "document",
					storage_provider: "listing-public-v1",
					storage_key: "seed/boats/ocean-retreat/spec-sheet.pdf",
					access: "private",
					alt_text: "Ocean Retreat spec sheet",
					is_primary: false,
					sort_order: 1,
				},
				{
					id: "seed_listing_asset_excursion_primary",
					listing_id: excursionListingId,
					kind: "image",
					storage_provider: "listing-public-v1",
					storage_key: "seed/excursions/historic-center/hero.jpg",
					access: "public",
					alt_text: "Historic Center Walk group",
					is_primary: true,
					sort_order: 0,
				},
			],
			now
		),
		listingPricingProfiles: withCommon(
			[
				{
					id: boatPricingProfileId,
					listing_id: boatListingId,
					name: "Boat charter hourly",
					currency: "RUB",
					base_hourly_price_cents: 300_000,
					minimum_hours: 2,
					deposit_bps: 3000,
					service_fee_bps: 500,
					tax_bps: 1000,
					is_default: true,
					created_by_user_id: operatorUserId,
				},
				{
					id: excursionPricingProfileId,
					listing_id: excursionListingId,
					name: "Excursion base pricing",
					currency: "RUB",
					base_hourly_price_cents: 120_000,
					minimum_hours: 3,
					service_fee_bps: 500,
					tax_bps: 1000,
					is_default: true,
					created_by_user_id: operatorUserId,
				},
			],
			now
		),
		listingPricingRules: withCommon(
			[
				{
					id: "seed_pricing_rule_boat_special",
					listing_id: boatListingId,
					pricing_profile_id: boatPricingProfileId,
					name: "Demo special pricing",
					rule_type: "seasonal_markup",
					condition_json: toJson({ alwaysApply: true }),
					adjustment_type: "percent",
					adjustment_value: 10,
					priority: 0,
					is_active: true,
				},
				{
					id: "seed_pricing_rule_excursion_group",
					listing_id: excursionListingId,
					pricing_profile_id: excursionPricingProfileId,
					name: "Large group uplift",
					rule_type: "group_size",
					condition_json: toJson({ minPassengers: 8 }),
					adjustment_type: "flat_cents",
					adjustment_value: 20_000,
					priority: 0,
					is_active: true,
				},
			],
			now
		),
		paymentProviderConfigs: withCommon(
			[
				{
					id: "seed_payment_provider_config_stripe",
					provider: "stripe",
					display_name: "Stripe (test)",
					is_active: true,
					supported_currencies: toJson(["RUB", "USD"]),
					sandbox_available: true,
				},
			],
			now
		),
		orgPaymentConfigs: withCommon(
			[
				{
					id: "seed_org_payment_config_stripe",
					organization_id: starterOrgId,
					provider_config_id: "seed_payment_provider_config_stripe",
					provider: "stripe",
					is_active: true,
					encrypted_credentials: "seed-placeholder-not-real",
					credential_key_version: 1,
					webhook_endpoint_id: `seed_webhook_endpoint_${starterOrgId}`,
					validation_status: "validated",
					validated_at: now,
				},
			],
			now
		),
		listingPublications: withCommon(
			[
				{
					id: boatMarketplacePublicationId,
					listing_id: boatListingId,
					organization_id: starterOrgId,
					channel_type: "platform_marketplace",
					channel_id: "seed-public-marketplace",
					is_active: true,
					visibility: "public",
					merchant_type: "platform",
					merchant_payment_config_id: "seed_org_payment_config_stripe",
					pricing_profile_id: boatPricingProfileId,
					display_config: toJson({ featuredBadge: "Best seller" }),
				},
				{
					id: boatOwnSitePublicationId,
					listing_id: boatListingId,
					organization_id: starterOrgId,
					channel_type: "own_site",
					channel_id: "starter-org-site",
					is_active: true,
					visibility: "public",
					merchant_type: "owner",
					merchant_payment_config_id: "seed_org_payment_config_stripe",
					pricing_profile_id: boatPricingProfileId,
				},
				{
					id: excursionMarketplacePublicationId,
					listing_id: excursionListingId,
					organization_id: starterOrgId,
					channel_type: "platform_marketplace",
					channel_id: "seed-public-marketplace",
					is_active: true,
					visibility: "public",
					merchant_type: "platform",
					merchant_payment_config_id: "seed_org_payment_config_stripe",
					pricing_profile_id: excursionPricingProfileId,
					display_config: toJson({ featuredBadge: "Editorial pick" }),
				},
			],
			now
		),
		listingModerationAudit: [
			{
				id: "seed_listing_moderation_boat_approved",
				organization_id: starterOrgId,
				listing_id: boatListingId,
				action: "approved",
				note: "Approved after marina and safety verification.",
				acted_by_user_id: operatorUserId,
				acted_at: now,
				created_at: now,
			},
			{
				id: "seed_listing_moderation_excursion_approved",
				organization_id: starterOrgId,
				listing_id: excursionListingId,
				action: "approved",
				note: "Approved after route and content review.",
				acted_by_user_id: operatorUserId,
				acted_at: now,
				created_at: now,
			},
		],
		organizationManualOverrides: withCommon(
			[
				{
					id: "seed_org_manual_override_listing_pricing",
					organization_id: starterOrgId,
					scope_type: "listing",
					scope_key: boatListingId,
					code: "ALLOW_MANUAL_PRICING",
					title: "Allow manual pricing override",
					note: "Keep this active for demoing the manual override workflow.",
					is_active: true,
					created_by_user_id: adminUserId,
				},
			],
			now
		),
		organizationCalendarAccounts: withCommon(
			[
				{
					id: boatCalendarAccountId,
					organization_id: starterOrgId,
					provider: "google",
					external_account_id: "seed-google-account-boat-primary",
					account_email: "fleet@example.com",
					display_name: "Starter Fleet Google",
					status: "connected",
					created_by_user_id: operatorUserId,
				},
			],
			now
		),
		organizationCalendarSources: withCommon(
			[
				{
					id: boatPrimaryCalendarSourceId,
					organization_id: starterOrgId,
					calendar_account_id: boatCalendarAccountId,
					provider: "google",
					external_calendar_id: "seed-google-calendar-boat-1",
					name: "Sea Explorer Bookings",
					timezone: "Europe/Moscow",
					is_primary: true,
					is_hidden: false,
					is_active: true,
					source_metadata: toJson({ description: "Primary fleet calendar" }),
					last_discovered_at: now,
				},
				{
					id: boatBackupCalendarSourceId,
					organization_id: starterOrgId,
					calendar_account_id: boatCalendarAccountId,
					provider: "google",
					external_calendar_id: "seed-google-calendar-boat-backup",
					name: "Sea Explorer Backup",
					timezone: "Europe/Moscow",
					is_primary: false,
					is_hidden: false,
					is_active: true,
					source_metadata: toJson({ description: "Secondary fleet calendar" }),
					last_discovered_at: now,
				},
			],
			now
		),
		listingCalendarConnections: withCommon(
			[
				{
					id: boatCalendarConnectionId,
					listing_id: boatListingId,
					organization_id: starterOrgId,
					calendar_account_id: boatCalendarAccountId,
					calendar_source_id: boatPrimaryCalendarSourceId,
					provider: "google",
					external_calendar_id: "seed-google-calendar-boat-1",
					sync_token: "seed-sync-token",
					sync_status: "idle",
					is_primary: true,
					is_active: true,
					created_by_user_id: operatorUserId,
				},
			],
			now
		),
		listingAvailabilityRules: withCommon(
			[...boatAvailabilityRules, ...excursionAvailabilityRules],
			now
		),
		listingAvailabilityExceptions: withCommon(
			[
				{
					id: "seed_availability_exception_boat_event",
					listing_id: boatListingId,
					date: exceptionDate,
					is_available: false,
					start_minute: 15 * 60,
					end_minute: 16 * 60,
					reason: "Private regatta preparation",
					created_by_user_id: operatorUserId,
				},
			],
			now
		),
		listingMinimumDurationRules: withCommon(
			[
				{
					id: "seed_min_duration_rule_boat_evening",
					listing_id: boatListingId,
					start_hour: 16,
					start_minute: 0,
					end_hour: 18,
					end_minute: 0,
					minimum_duration_minutes: 180,
					days_of_week: null,
					is_active: true,
				},
				{
					id: "seed_min_duration_rule_excursion",
					listing_id: excursionListingId,
					start_hour: 10,
					start_minute: 0,
					end_hour: 17,
					end_minute: 0,
					minimum_duration_minutes: 180,
					days_of_week: null,
					is_active: true,
				},
			],
			now
		),
		listingAvailabilityBlocks: withCommon(
			[
				{
					id: "seed_availability_block_boat_calendar",
					listing_id: boatListingId,
					calendar_connection_id: boatCalendarConnectionId,
					source: "calendar",
					external_ref: "seed-calendar-busy-window-1",
					starts_at: boatCalendarBlockStartsAt,
					ends_at: boatCalendarBlockEndsAt,
					reason: "Imported Google Calendar hold",
					is_active: true,
					created_by_user_id: operatorUserId,
				},
			],
			now
		),
		bookingDiscountCodes: withCommon(
			[
				{
					id: boatDiscountCodeId,
					organization_id: starterOrgId,
					code: "SPRING10",
					name: "Spring charter discount",
					description: "10% off seeded charter requests.",
					discount_type: "percentage",
					discount_value: 10,
					minimum_subtotal_cents: 500_000,
					valid_from: now,
					valid_to: new Date(nowMs + 30 * DAY_MS).toISOString(),
					usage_limit: 100,
					usage_count: 1,
					per_customer_limit: 2,
					applies_to_listing_id: boatListingId,
					is_active: true,
					created_by_user_id: operatorUserId,
				},
			],
			now
		),
		cancellationPolicies: withCommon(
			[
				{
					id: "seed_cancellation_policy_standard",
					organization_id: starterOrgId,
					listing_id: boatListingId,
					scope: "listing",
					name: "Standard",
					free_window_hours: 48,
					penalty_bps: 5000,
					is_active: true,
				},
			],
			now
		),
		bookings: withCommon(
			[
				{
					id: "seed_booking_confirmed_1",
					organization_id: starterOrgId,
					listing_id: boatListingId,
					publication_id: boatMarketplacePublicationId,
					merchant_organization_id: starterOrgId,
					merchant_payment_config_id: "seed_org_payment_config_stripe",
					customer_user_id: memberUserId,
					source: "web",
					status: "confirmed",
					payment_status: "paid",
					calendar_sync_status: "not_applicable",
					starts_at: boatBookingStartsAt,
					ends_at: boatBookingEndsAt,
					passengers: 6,
					contact_name: "Member User",
					contact_phone: "+7 900 100-00-00",
					contact_email: "member@example.com",
					timezone: "Europe/Moscow",
					base_price_cents: 1_500_000,
					discount_amount_cents: 150_000,
					total_price_cents: 1_350_000,
					platform_commission_cents: 0,
					currency: "RUB",
					notes: "Seeded booking with applied promotion for operator demos.",
				},
			],
			now
		),
		bookingDiscountApplications: withCommon(
			[
				{
					id: "seed_booking_discount_application_1",
					booking_id: "seed_booking_confirmed_1",
					discount_code_id: boatDiscountCodeId,
					customer_user_id: memberUserId,
					code: "SPRING10",
					discount_type: "percentage",
					discount_value: 10,
					applied_amount_cents: 150_000,
				},
			],
			now
		),
	};

	if (profile === "calendar-integration") {
		const integrationListingId = "seed_listing_boat_calendar_integration";
		const integrationPricingProfileId = "seed_pricing_boat_calendar_integration";
		const integrationPublicationId =
			"seed_publication_boat_calendar_integration";

		seed.listings.push({
			id: integrationListingId,
			organization_id: starterOrgId,
			listing_type_slug: boatTypeSlug,
			location_id: boatLocationId,
			name: "Calendar Integration Test Boat",
			slug: "calendar-integration-test-boat",
			description:
				"Dedicated seeded boat listing for real calendar integration verification.",
			metadata: toJson({
				seedNamespace: "seed",
				profile: "calendar-integration",
			}),
			timezone: "Europe/Moscow",
			status: "draft",
			is_active: true,
		});

		seed.listingBoatRentProfiles.push({
			listing_id: integrationListingId,
			capacity: 8,
			captain_mode: "both",
			departure_area: "Moscow River North Pier",
			base_port: "North Pier",
			rental_mode: "both",
			deposit_required: false,
			fuel_policy: "included",
			instant_book_allowed: false,
			min_duration_hours: 2,
			max_duration_hours: 8,
			requires_manager_review: false,
		});

		seed.listingPricingProfiles.push({
			id: integrationPricingProfileId,
			listing_id: integrationListingId,
			name: "Calendar Integration Base",
			currency: "RUB",
			pricing_model: "hourly",
			base_price_cents: 400_000,
			hourly_rate_cents: 400_000,
			min_duration_hours: 2,
			is_default: true,
			is_active: true,
		});

		seed.listingPublications.push({
			id: integrationPublicationId,
			listing_id: integrationListingId,
			organization_id: starterOrgId,
			channel_type: "own_site",
			is_active: true,
		});

		for (const dayOfWeek of everydayWeekdays) {
			seed.listingAvailabilityRules.push({
				id: `seed_availability_rule_integration_${dayOfWeek}`,
				listing_id: integrationListingId,
				day_of_week: dayOfWeek,
				start_minute: 9 * 60,
				end_minute: 21 * 60,
				is_active: true,
			});
		}
	}

	return seed;
};

const upsert = async (client, table, conflictColumns, row) => {
	const columns = Object.keys(row);
	const values = Object.values(row);
	const placeholders = columns.map((_, i) => `$${i + 1}`);
	const updateColumns = columns.filter((c) => !conflictColumns.includes(c));

	const sql = [
		`INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")})`,
		`VALUES (${placeholders.join(", ")})`,
		`ON CONFLICT (${conflictColumns.map(quote).join(", ")})`,
		`DO UPDATE SET ${updateColumns.map((c) => `${quote(c)} = EXCLUDED.${quote(c)}`).join(", ")}`,
	].join(" ");

	await client.query(sql, values);
};

const clearSeedNamespace = async (client) => {
	for (const [table, keyColumn] of [
		["listing_boat_rent_profile", "listing_id"],
		["listing_excursion_profile", "listing_id"],
	]) {
		await client.query(
			`DELETE FROM ${quote(table)} WHERE ${quote(keyColumn)} LIKE $1`,
			["seed_%"]
		);
	}

	for (const table of CLEANUP_TABLES) {
		await client.query(
			`DELETE FROM ${quote(table)} WHERE ${quote("id")} LIKE $1`,
			["seed_%"]
		);
	}

	await client.query(
		`DELETE FROM ${quote("user")} WHERE ${quote("id")} LIKE $1`,
		["seed_%"]
	);

	await client.query(
		`DELETE FROM ${quote("todo")} WHERE ${quote("id")} >= $1 AND ${quote("id")} <= $2`,
		[TODO_ID_MIN, TODO_ID_MAX]
	);
};

const seedNamespaceExists = async (client) => {
	const result = await client.query(
		`SELECT 1 FROM ${quote("organization")} WHERE ${quote("id")} = $1 LIMIT 1`,
		[SEED_MARKER_ORGANIZATION_ID]
	);

	return result.rowCount > 0;
};

const writeSeedData = async (client, seed) => {
	const tableRows = [
		["organization", seed.organizations],
		["user", seed.users],
		["account", seed.accounts],
		["member", seed.members],
		["invitation", seed.invitations],
		["user_consent", seed.consents],
		["notification_event", seed.notificationEvents],
		["notification_intent", seed.notificationIntents],
		["notification_delivery", seed.notificationDeliveries],
		["notification_in_app", seed.notificationInApp],
		["notification_preference", seed.notificationPreferences],
		["todo", seed.todos],
		["assistant_chat", seed.assistantChats],
		["assistant_message", seed.assistantMessages],
		// marketplace (insert order: parents before children)
		["listing_type_config", seed.listingTypeConfigs],
		["organization_listing_type", seed.organizationListingTypes],
		["organization_settings", seed.orgSettings],
		["organization_onboarding", seed.organizationOnboarding],
		["listing_location", seed.listingLocations],
		["listing", seed.listings],
		["listing_boat_rent_profile", seed.listingBoatRentProfiles, ["listing_id"]],
		["listing_excursion_profile", seed.listingExcursionProfiles, ["listing_id"]],
		["listing_amenity", seed.listingAmenities],
		["listing_asset", seed.listingAssets],
		["listing_pricing_profile", seed.listingPricingProfiles],
		["listing_pricing_rule", seed.listingPricingRules],
		["payment_provider_config", seed.paymentProviderConfigs],
		["organization_payment_config", seed.orgPaymentConfigs],
		["listing_publication", seed.listingPublications],
		["listing_moderation_audit", seed.listingModerationAudit],
		["organization_manual_override", seed.organizationManualOverrides],
		["organization_calendar_account", seed.organizationCalendarAccounts],
		["organization_calendar_source", seed.organizationCalendarSources],
		["listing_calendar_connection", seed.listingCalendarConnections],
		["listing_availability_rule", seed.listingAvailabilityRules],
		["listing_availability_exception", seed.listingAvailabilityExceptions],
		["listing_minimum_duration_rule", seed.listingMinimumDurationRules],
		["listing_availability_block", seed.listingAvailabilityBlocks],
		["booking_discount_code", seed.bookingDiscountCodes],
		["cancellation_policy", seed.cancellationPolicies],
		["booking", seed.bookings],
		["booking_discount_application", seed.bookingDiscountApplications],
	];

	for (const [table, rows, conflictColumns = ["id"]] of tableRows) {
		for (const row of rows) {
			await upsert(client, table, conflictColumns, row);
		}
	}
};

const main = async () => {
	const options = parseCliArgs();
	const connectionString =
		options.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

	const client = new Client({ connectionString });
	await client.connect();

	try {
		if (options.skipIfPresent && (await seedNamespaceExists(client))) {
			console.log(
				[
					`Seed namespace already present in ${connectionString.replace(/\/\/.*@/, "//***@")}`,
					`Marker organization: ${SEED_MARKER_ORGANIZATION_ID}`,
					"Skipping demo seed bootstrap.",
				].join("\n")
			);
			return;
		}

		const adminPasswordHash = await hashPassword("admin");
		const operatorPasswordHash = await hashPassword("operator");

		const seed = buildSeedData({
			anchorDate: options.anchorDate,
			adminPasswordHash,
			operatorPasswordHash,
			profile: options.profile,
		});

		await client.query("BEGIN");
		try {
			if (!options.append) {
				await clearSeedNamespace(client);
			}
			await writeSeedData(client, seed);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}

		console.log(
			[
				`Seeded database: ${connectionString.replace(/\/\/.*@/, "//***@")}`,
				`Anchor date: ${options.anchorDate}`,
				`Profile: ${options.profile}`,
				`Organizations: ${seed.organizations.map((org) => org.slug).join(", ")}`,
				`Users: ${seed.users.length}, notifications: ${seed.notificationEvents.length}, todos: ${seed.todos.length}`,
				`Listings: ${seed.listings.length}, bookings: ${seed.bookings.length}`,
				"Admin login: admin@admin.com / admin",
				"Operator login: operator@example.com / operator",
			].join("\n")
		);
	} finally {
		await client.end();
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
