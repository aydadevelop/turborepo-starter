CREATE TYPE "affiliate_attribution_source" AS ENUM('cookie', 'query', 'manual');--> statement-breakpoint
CREATE TYPE "affiliate_payout_status" AS ENUM('pending', 'eligible', 'paid', 'voided');--> statement-breakpoint
CREATE TYPE "affiliate_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "assistant_chat_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "assistant_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "availability_block_source" AS ENUM('manual', 'calendar', 'maintenance', 'system');--> statement-breakpoint
CREATE TYPE "calendar_account_status" AS ENUM('connected', 'error', 'disconnected');--> statement-breakpoint
CREATE TYPE "calendar_connection_sync_status" AS ENUM('idle', 'syncing', 'error', 'disabled');--> statement-breakpoint
CREATE TYPE "calendar_provider" AS ENUM('google', 'outlook', 'ical', 'manual');--> statement-breakpoint
CREATE TYPE "calendar_webhook_event_status" AS ENUM('processed', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "consent_type" AS ENUM('service_agreement', 'user_agreement', 'privacy_policy');--> statement-breakpoint
CREATE TYPE "booking_payment_attempt_status" AS ENUM('initiated', 'requires_action', 'authorized', 'captured', 'failed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "booking_payment_status" AS ENUM('unpaid', 'pending', 'partially_paid', 'paid', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "booking_source" AS ENUM('manual', 'web', 'telegram', 'partner', 'api', 'calendar_sync');--> statement-breakpoint
CREATE TYPE "booking_status" AS ENUM('pending', 'awaiting_payment', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show', 'disputed');--> statement-breakpoint
CREATE TYPE "calendar_sync_status" AS ENUM('pending', 'linked', 'sync_error', 'detached', 'not_applicable');--> statement-breakpoint
CREATE TYPE "cancellation_policy_scope" AS ENUM('listing', 'organization');--> statement-breakpoint
CREATE TYPE "cancellation_request_status" AS ENUM('requested', 'pending_review', 'approved', 'rejected', 'applied', 'cancelled');--> statement-breakpoint
CREATE TYPE "discount_type" AS ENUM('percentage', 'fixed_cents');--> statement-breakpoint
CREATE TYPE "dispute_status" AS ENUM('open', 'under_review', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "listing_asset_kind" AS ENUM('image', 'document', 'other');--> statement-breakpoint
CREATE TYPE "listing_boat_rent_captain_mode" AS ENUM('captained_only', 'self_drive_only', 'captain_optional');--> statement-breakpoint
CREATE TYPE "listing_boat_rent_fuel_policy" AS ENUM('included', 'charged_by_usage', 'return_same_level');--> statement-breakpoint
CREATE TYPE "listing_excursion_group_format" AS ENUM('group', 'private', 'both');--> statement-breakpoint
CREATE TYPE "listing_moderation_action" AS ENUM('approved', 'approval_cleared');--> statement-breakpoint
CREATE TYPE "listing_status" AS ENUM('draft', 'active', 'maintenance', 'inactive');--> statement-breakpoint
CREATE TYPE "merchant_type" AS ENUM('owner', 'platform');--> statement-breakpoint
CREATE TYPE "payment_adjustment_status" AS ENUM('none', 'pending', 'captured', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "payment_provider" AS ENUM('cloudpayments', 'stripe');--> statement-breakpoint
CREATE TYPE "publication_channel_type" AS ENUM('own_site', 'platform_marketplace', 'partner_site', 'widget');--> statement-breakpoint
CREATE TYPE "publication_visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TYPE "refund_status" AS ENUM('requested', 'approved', 'processed', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "review_status" AS ENUM('pending', 'published', 'hidden', 'flagged');--> statement-breakpoint
CREATE TYPE "shift_request_decision" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "shift_request_initiator_role" AS ENUM('customer', 'manager');--> statement-breakpoint
CREATE TYPE "shift_request_status" AS ENUM('pending', 'approved', 'rejected', 'applied', 'cancelled');--> statement-breakpoint
CREATE TYPE "staff_assignment_role" AS ENUM('primary', 'backup', 'assistant');--> statement-breakpoint
CREATE TYPE "storage_access" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "validation_status" AS ENUM('pending', 'validated', 'failed', 'suspended');--> statement-breakpoint
CREATE TYPE "webhook_event_status" AS ENUM('received', 'authenticated', 'processed', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "webhook_type" AS ENUM('check', 'pay', 'fail', 'confirm', 'refund', 'cancel');--> statement-breakpoint
CREATE TYPE "organization_manual_override_scope" AS ENUM('organization', 'listing');--> statement-breakpoint
CREATE TYPE "notification_channel" AS ENUM('in_app', 'telegram', 'vk', 'max', 'social', 'email', 'sms');--> statement-breakpoint
CREATE TYPE "notification_delivery_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "notification_event_status" AS ENUM('queued', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "notification_intent_status" AS ENUM('pending', 'filtered_out', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "notification_severity" AS ENUM('info', 'success', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "inbound_message_channel" AS ENUM('telegram', 'avito', 'email', 'web', 'api');--> statement-breakpoint
CREATE TYPE "inbound_message_status" AS ENUM('received', 'deduplicated', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "support_message_channel" AS ENUM('internal', 'web', 'telegram', 'avito', 'email', 'api');--> statement-breakpoint
CREATE TYPE "support_ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "support_ticket_source" AS ENUM('manual', 'web', 'telegram', 'avito', 'email', 'api');--> statement-breakpoint
CREATE TYPE "support_ticket_status" AS ENUM('open', 'pending_customer', 'pending_operator', 'escalated', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "workflow_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "workflow_step_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "affiliate_referral" (
	"id" text PRIMARY KEY,
	"affiliate_user_id" text NOT NULL,
	"affiliate_organization_id" text,
	"code" text NOT NULL,
	"name" text,
	"status" "affiliate_status" DEFAULT 'active'::"affiliate_status" NOT NULL,
	"attribution_window_days" integer DEFAULT 30 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_affiliate_attribution" (
	"id" text PRIMARY KEY,
	"booking_id" text NOT NULL,
	"affiliate_user_id" text NOT NULL,
	"referral_id" text NOT NULL,
	"referral_code" text NOT NULL,
	"source" "affiliate_attribution_source" NOT NULL,
	"clicked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_affiliate_payout" (
	"id" text PRIMARY KEY,
	"attribution_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"affiliate_user_id" text NOT NULL,
	"commission_amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"status" "affiliate_payout_status" DEFAULT 'pending'::"affiliate_payout_status" NOT NULL,
	"eligible_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"external_payout_ref" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_chat" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"user_id" text NOT NULL,
	"visibility" "assistant_chat_visibility" DEFAULT 'private'::"assistant_chat_visibility" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_message" (
	"id" text PRIMARY KEY,
	"chat_id" text NOT NULL,
	"role" "assistant_message_role" NOT NULL,
	"parts" jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"telegram_id" text,
	"telegram_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"aaguid" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"active_organization_id" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone_number" text UNIQUE,
	"phone_number_verified" boolean,
	"telegram_id" text,
	"telegram_username" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"is_anonymous" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_calendar_link" (
	"id" text PRIMARY KEY,
	"booking_id" text NOT NULL,
	"calendar_connection_id" text,
	"provider" "calendar_provider" NOT NULL,
	"provider_event_id" text,
	"ical_uid" text,
	"last_synced_at" timestamp with time zone,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_webhook_event" (
	"id" text PRIMARY KEY,
	"calendar_connection_id" text NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"provider_channel_id" text,
	"provider_resource_id" text,
	"message_number" integer,
	"resource_state" text,
	"status" "calendar_webhook_event_status" DEFAULT 'processed'::"calendar_webhook_event_status" NOT NULL,
	"error_message" text,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_availability_block" (
	"id" text PRIMARY KEY,
	"listing_id" text NOT NULL,
	"calendar_connection_id" text,
	"source" "availability_block_source" DEFAULT 'manual'::"availability_block_source" NOT NULL,
	"external_ref" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_availability_block_ck_window" CHECK ("ends_at" > "starts_at")
);
--> statement-breakpoint
CREATE TABLE "listing_availability_exception" (
	"id" text PRIMARY KEY,
	"listing_id" text NOT NULL,
	"date" date NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"start_minute" integer,
	"end_minute" integer,
	"reason" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_availability_exception_ck_minutes" CHECK ((
				("start_minute" is null and "end_minute" is null)
				or (
					"start_minute" is not null
					and "end_minute" is not null
					and "start_minute" >= 0
					and "start_minute" < 1440
					and "end_minute" > "start_minute"
					and "end_minute" <= 1440
				)
			))
);
--> statement-breakpoint
CREATE TABLE "listing_availability_rule" (
	"id" text PRIMARY KEY,
	"listing_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_availability_rule_ck_day_of_week" CHECK ("day_of_week" between 0 and 6),
	CONSTRAINT "listing_availability_rule_ck_minute_range" CHECK ("start_minute" >= 0 and "start_minute" < 1440 and "end_minute" > "start_minute" and "end_minute" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "listing_calendar_connection" (
	"id" text PRIMARY KEY,
	"listing_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"calendar_account_id" text,
	"calendar_source_id" text,
	"provider" "calendar_provider" NOT NULL,
	"external_calendar_id" text,
	"sync_token" text,
	"watch_channel_id" text,
	"watch_resource_id" text,
	"watch_expiration" timestamp with time zone,
	"sync_status" "calendar_connection_sync_status" DEFAULT 'idle'::"calendar_connection_sync_status" NOT NULL,
	"sync_retry_count" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_minimum_duration_rule" (
	"id" text PRIMARY KEY,
	"listing_id" text NOT NULL,
	"start_hour" integer NOT NULL,
	"start_minute" integer DEFAULT 0 NOT NULL,
	"end_hour" integer NOT NULL,
	"end_minute" integer DEFAULT 0 NOT NULL,
	"minimum_duration_minutes" integer NOT NULL,
	"days_of_week" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_minimum_duration_rule_ck_time_bounds" CHECK ("start_hour" between 0 and 23 and "end_hour" between 0 and 23 and "start_minute" between 0 and 59 and "end_minute" between 0 and 59),
	CONSTRAINT "listing_minimum_duration_rule_ck_positive_duration" CHECK ("minimum_duration_minutes" > 0 and (("end_hour" * 60) + "end_minute") > (("start_hour" * 60) + "start_minute"))
);
--> statement-breakpoint
CREATE TABLE "organization_calendar_account" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"external_account_id" text NOT NULL,
	"account_email" text,
	"display_name" text,
	"status" "calendar_account_status" DEFAULT 'connected'::"calendar_account_status" NOT NULL,
	"provider_metadata" jsonb,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_calendar_source" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"calendar_account_id" text NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"external_calendar_id" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_metadata" jsonb,
	"last_discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_consent" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"consent_type" "consent_type" NOT NULL,
	"consent_version" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_location" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"latitude" double precision,
	"longitude" double precision,
	"timezone" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_type_config" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL,
	"service_family" text DEFAULT 'boat_rent' NOT NULL,
	"label" text NOT NULL,
	"icon" text,
	"metadata_json_schema" jsonb NOT NULL,
	"default_amenity_keys" jsonb,
	"required_fields" jsonb,
	"supported_pricing_models" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_listing_type" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"listing_type_slug" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_manual_override" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"scope_type" "organization_manual_override_scope" DEFAULT 'organization'::"organization_manual_override_scope" NOT NULL,
	"scope_key" text,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"resolved_by_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_onboarding" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"payment_configured" boolean DEFAULT false NOT NULL,
	"calendar_connected" boolean DEFAULT false NOT NULL,
	"listing_published" boolean DEFAULT false NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"last_recalculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"default_currency" text DEFAULT 'RUB' NOT NULL,
	"default_language" text DEFAULT 'ru' NOT NULL,
	"search_language" text DEFAULT 'russian' NOT NULL,
	"business_hours_start" integer DEFAULT 9 NOT NULL,
	"business_hours_end" integer DEFAULT 21 NOT NULL,
	"cancellation_free_window_hours" integer DEFAULT 24 NOT NULL,
	"cancellation_penalty_bps" integer DEFAULT 0 NOT NULL,
	"booking_requires_approval" boolean DEFAULT false NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"website_url" text,
	"brand_config" jsonb,
	"notification_defaults" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"listing_type_slug" text NOT NULL,
	"location_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"minimum_duration_minutes" integer DEFAULT 60 NOT NULL,
	"minimum_notice_minutes" integer DEFAULT 0 NOT NULL,
	"allow_shift_requests" boolean DEFAULT true NOT NULL,
	"working_hours_start" integer DEFAULT 9 NOT NULL,
	"working_hours_end" integer DEFAULT 21 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" "listing_status" DEFAULT 'draft'::"listing_status" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"approved_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_ck_minimums" CHECK ("minimum_duration_minutes" > 0 and "minimum_notice_minutes" >= 0),
	CONSTRAINT "listing_ck_working_hours" CHECK ("working_hours_start" between 0 and 23 and "working_hours_end" between 1 and 24 and "working_hours_end" > "working_hours_start")
);
--> statement-breakpoint
CREATE TABLE "listing_amenity" (
	"id" text PRIMARY KEY,
	"listing_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_asset" (
	"id" text PRIMARY KEY,
	"listing_id" text NOT NULL,
	"kind" "listing_asset_kind" DEFAULT 'image'::"listing_asset_kind" NOT NULL,
	"storage_provider" text DEFAULT 'listing-public-v1' NOT NULL,
	"storage_key" text NOT NULL,
	"access" "storage_access" DEFAULT 'public'::"storage_access" NOT NULL,
	"mime_type" text,
	"alt_text" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_boat_rent_profile" (
	"listing_id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"capacity" integer,
	"captain_mode" "listing_boat_rent_captain_mode" DEFAULT 'captained_only'::"listing_boat_rent_captain_mode" NOT NULL,
	"base_port" text,
	"departure_area" text,
	"fuel_policy" "listing_boat_rent_fuel_policy" DEFAULT 'included'::"listing_boat_rent_fuel_policy" NOT NULL,
	"deposit_required" boolean DEFAULT false NOT NULL,
	"instant_book_allowed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_boat_rent_profile_ck_capacity" CHECK ("capacity" is null or "capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "listing_excursion_profile" (
	"listing_id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"meeting_point" text,
	"duration_minutes" integer,
	"group_format" "listing_excursion_group_format" DEFAULT 'group'::"listing_excursion_group_format" NOT NULL,
	"max_group_size" integer,
	"primary_language" text,
	"tickets_included" boolean DEFAULT false NOT NULL,
	"child_friendly" boolean DEFAULT false NOT NULL,
	"instant_book_allowed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_excursion_profile_ck_duration_minutes" CHECK ("duration_minutes" is null or "duration_minutes" > 0),
	CONSTRAINT "listing_excursion_profile_ck_max_group_size" CHECK ("max_group_size" is null or "max_group_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "listing_moderation_audit" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"action" "listing_moderation_action" NOT NULL,
	"note" text,
	"acted_by_user_id" text,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_pricing_profile" (
	"id" text PRIMARY KEY,
	"listing_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"base_hourly_price_cents" integer NOT NULL,
	"minimum_hours" integer DEFAULT 1 NOT NULL,
	"deposit_bps" integer DEFAULT 0 NOT NULL,
	"service_fee_bps" integer DEFAULT 0 NOT NULL,
	"affiliate_fee_bps" integer DEFAULT 0 NOT NULL,
	"tax_bps" integer DEFAULT 0 NOT NULL,
	"acquiring_fee_bps" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by_user_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_pricing_profile_ck_positive_amounts" CHECK ("base_hourly_price_cents" > 0 and "minimum_hours" > 0),
	CONSTRAINT "listing_pricing_profile_ck_bps_range" CHECK ("deposit_bps" between 0 and 10000
				and "service_fee_bps" between 0 and 10000
				and "affiliate_fee_bps" between 0 and 10000
				and "tax_bps" between 0 and 10000
				and "acquiring_fee_bps" between 0 and 10000),
	CONSTRAINT "listing_pricing_profile_ck_valid_window" CHECK ("valid_from" is null or "valid_to" is null or "valid_to" > "valid_from")
);
--> statement-breakpoint
CREATE TABLE "listing_pricing_rule" (
	"id" text PRIMARY KEY,
	"listing_id" text NOT NULL,
	"pricing_profile_id" text NOT NULL,
	"name" text NOT NULL,
	"rule_type" text NOT NULL,
	"condition_json" jsonb NOT NULL,
	"adjustment_type" text NOT NULL,
	"adjustment_value" integer NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_fee_config" (
	"id" text PRIMARY KEY,
	"currency" text NOT NULL,
	"platform_fee_bps" integer DEFAULT 0 NOT NULL,
	"affiliate_fee_bps" integer DEFAULT 0 NOT NULL,
	"tax_bps" integer DEFAULT 0 NOT NULL,
	"acquiring_fee_bps" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_payment_config" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"provider_config_id" text NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"public_key" text,
	"encrypted_credentials" text NOT NULL,
	"credential_key_version" integer DEFAULT 1 NOT NULL,
	"webhook_endpoint_id" text NOT NULL,
	"validated_at" timestamp with time zone,
	"validation_status" "validation_status" DEFAULT 'pending'::"validation_status" NOT NULL,
	"platform_service_fee_bps" integer,
	"payout_config" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_provider_config" (
	"id" text PRIMARY KEY,
	"provider" "payment_provider" NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"supported_currencies" jsonb NOT NULL,
	"default_acquiring_fee_bps" integer DEFAULT 0 NOT NULL,
	"default_platform_fee_bps" integer DEFAULT 0 NOT NULL,
	"min_platform_fee_bps" integer DEFAULT 0 NOT NULL,
	"config_schema" jsonb,
	"sandbox_available" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_event" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"webhook_type" "webhook_type" NOT NULL,
	"status" "webhook_event_status" DEFAULT 'received'::"webhook_event_status" NOT NULL,
	"request_signature" text,
	"payload" jsonb,
	"response_code" integer,
	"error_message" text,
	"processing_duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_publication" (
	"id" text PRIMARY KEY,
	"listing_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"channel_type" "publication_channel_type" NOT NULL,
	"channel_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"visibility" "publication_visibility" DEFAULT 'public'::"publication_visibility" NOT NULL,
	"merchant_type" "merchant_type" DEFAULT 'platform'::"merchant_type" NOT NULL,
	"merchant_payment_config_id" text,
	"platform_fee_bps" integer,
	"pricing_profile_id" text,
	"display_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"publication_id" text NOT NULL,
	"merchant_organization_id" text NOT NULL,
	"merchant_payment_config_id" text,
	"customer_user_id" text,
	"created_by_user_id" text,
	"source" "booking_source" NOT NULL,
	"status" "booking_status" DEFAULT 'pending'::"booking_status" NOT NULL,
	"payment_status" "booking_payment_status" DEFAULT 'unpaid'::"booking_payment_status" NOT NULL,
	"calendar_sync_status" "calendar_sync_status" DEFAULT 'pending'::"calendar_sync_status" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"passengers" integer,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"timezone" text,
	"base_price_cents" integer NOT NULL,
	"discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"total_price_cents" integer NOT NULL,
	"platform_commission_cents" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"notes" text,
	"special_requests" text,
	"external_ref" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" text,
	"cancellation_reason" text,
	"refund_amount_cents" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_cancellation_request" (
	"id" text PRIMARY KEY,
	"booking_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by_user_id" text,
	"initiated_by_role" "shift_request_initiator_role" NOT NULL,
	"status" "cancellation_request_status" DEFAULT 'requested'::"cancellation_request_status" NOT NULL,
	"reason" text,
	"reason_code" text,
	"customer_decision" "shift_request_decision" DEFAULT 'pending'::"shift_request_decision" NOT NULL,
	"customer_decision_by_user_id" text,
	"customer_decision_at" timestamp with time zone,
	"customer_decision_note" text,
	"manager_decision" "shift_request_decision" DEFAULT 'pending'::"shift_request_decision" NOT NULL,
	"manager_decision_by_user_id" text,
	"manager_decision_at" timestamp with time zone,
	"manager_decision_note" text,
	"booking_total_price_cents" integer DEFAULT 0 NOT NULL,
	"penalty_amount_cents" integer DEFAULT 0 NOT NULL,
	"refund_amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"refund_status" "refund_status",
	"refund_reference" text,
	"applied_by_user_id" text,
	"applied_at" timestamp with time zone,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_discount_application" (
	"id" text PRIMARY KEY,
	"booking_id" text NOT NULL,
	"discount_code_id" text NOT NULL,
	"customer_user_id" text,
	"code" text NOT NULL,
	"discount_type" "discount_type",
	"discount_value" integer,
	"applied_amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_discount_application_ck_applied_amount" CHECK ("applied_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "booking_discount_code" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" integer NOT NULL,
	"max_discount_cents" integer,
	"minimum_subtotal_cents" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"per_customer_limit" integer,
	"applies_to_listing_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_discount_code_ck_positive_values" CHECK ("discount_value" > 0
				and "minimum_subtotal_cents" >= 0
				and ("max_discount_cents" is null or "max_discount_cents" > 0)
				and ("usage_limit" is null or "usage_limit" > 0)
				and ("per_customer_limit" is null or "per_customer_limit" > 0)
				and "usage_count" >= 0),
	CONSTRAINT "booking_discount_code_ck_type_range" CHECK (("discount_type" = 'percentage' and "discount_value" between 1 and 100)
				or ("discount_type" = 'fixed_cents' and "discount_value" > 0)),
	CONSTRAINT "booking_discount_code_ck_valid_window" CHECK ("valid_from" is null or "valid_to" is null or "valid_to" > "valid_from")
);
--> statement-breakpoint
CREATE TABLE "booking_dispute" (
	"id" text PRIMARY KEY,
	"booking_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"raised_by_user_id" text,
	"status" "dispute_status" DEFAULT 'open'::"dispute_status" NOT NULL,
	"reason_code" text,
	"details" text,
	"resolution" text,
	"resolved_by_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_payment_attempt" (
	"id" text PRIMARY KEY,
	"booking_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by_user_id" text,
	"provider" text DEFAULT 'manual' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_intent_id" text,
	"status" "booking_payment_attempt_status" DEFAULT 'initiated'::"booking_payment_attempt_status" NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"failure_reason" text,
	"metadata" jsonb,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_refund" (
	"id" text PRIMARY KEY,
	"booking_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by_user_id" text,
	"approved_by_user_id" text,
	"processed_by_user_id" text,
	"status" "refund_status" DEFAULT 'requested'::"refund_status" NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"reason" text,
	"provider" text,
	"external_refund_id" text,
	"failure_reason" text,
	"metadata" jsonb,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_shift_request" (
	"id" text PRIMARY KEY,
	"booking_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by_user_id" text,
	"initiated_by_role" "shift_request_initiator_role" NOT NULL,
	"status" "shift_request_status" DEFAULT 'pending'::"shift_request_status" NOT NULL,
	"customer_decision" "shift_request_decision" DEFAULT 'pending'::"shift_request_decision" NOT NULL,
	"customer_decision_by_user_id" text,
	"customer_decision_at" timestamp with time zone,
	"customer_decision_note" text,
	"manager_decision" "shift_request_decision" DEFAULT 'pending'::"shift_request_decision" NOT NULL,
	"manager_decision_by_user_id" text,
	"manager_decision_at" timestamp with time zone,
	"manager_decision_note" text,
	"current_starts_at" timestamp with time zone NOT NULL,
	"current_ends_at" timestamp with time zone NOT NULL,
	"proposed_starts_at" timestamp with time zone NOT NULL,
	"proposed_ends_at" timestamp with time zone NOT NULL,
	"current_passengers" integer NOT NULL,
	"proposed_passengers" integer NOT NULL,
	"current_base_price_cents" integer DEFAULT 0 NOT NULL,
	"current_discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"current_total_price_cents" integer DEFAULT 0 NOT NULL,
	"current_pay_now_cents" integer DEFAULT 0 NOT NULL,
	"proposed_base_price_cents" integer DEFAULT 0 NOT NULL,
	"proposed_discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"proposed_total_price_cents" integer DEFAULT 0 NOT NULL,
	"proposed_pay_now_cents" integer DEFAULT 0 NOT NULL,
	"price_delta_cents" integer DEFAULT 0 NOT NULL,
	"pay_now_delta_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"discount_code" text,
	"reason" text,
	"rejected_by_user_id" text,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"applied_by_user_id" text,
	"applied_at" timestamp with time zone,
	"payment_adjustment_status" "payment_adjustment_status" DEFAULT 'none'::"payment_adjustment_status" NOT NULL,
	"payment_adjustment_amount_cents" integer DEFAULT 0 NOT NULL,
	"payment_adjustment_reference" text,
	"metadata" jsonb,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellation_policy" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"listing_id" text,
	"scope" "cancellation_policy_scope" NOT NULL,
	"name" text NOT NULL,
	"free_window_hours" integer DEFAULT 24 NOT NULL,
	"penalty_bps" integer DEFAULT 0 NOT NULL,
	"late_penalty_bps" integer DEFAULT 10000 NOT NULL,
	"late_penalty_window_hours" integer DEFAULT 2 NOT NULL,
	"no_show_full_charge" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_review" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"reviewer_user_id" text,
	"rating" integer NOT NULL,
	"title" text,
	"body" text,
	"status" "review_status" DEFAULT 'pending'::"review_status" NOT NULL,
	"published_at" timestamp with time zone,
	"moderated_by_user_id" text,
	"moderated_at" timestamp with time zone,
	"moderation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_review_response" (
	"id" text PRIMARY KEY,
	"review_id" text NOT NULL,
	"author_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_staff_assignment" (
	"id" text PRIMARY KEY,
	"booking_id" text NOT NULL,
	"member_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" "staff_assignment_role" DEFAULT 'primary'::"staff_assignment_role" NOT NULL,
	"assigned_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_staff_assignment" (
	"id" text PRIMARY KEY,
	"listing_id" text NOT NULL,
	"member_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" "staff_assignment_role" DEFAULT 'primary'::"staff_assignment_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_delivery" (
	"id" text PRIMARY KEY,
	"intent_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_recipient" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'queued'::"notification_delivery_status" NOT NULL,
	"provider_message_id" text,
	"failure_reason" text,
	"response_payload" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_event" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"actor_user_id" text,
	"event_type" text NOT NULL,
	"source_type" text,
	"source_id" text,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification_event_status" DEFAULT 'queued'::"notification_event_status" NOT NULL,
	"processing_started_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_in_app" (
	"id" text PRIMARY KEY,
	"event_id" text,
	"intent_id" text,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"cta_url" text,
	"severity" "notification_severity" DEFAULT 'info'::"notification_severity" NOT NULL,
	"metadata" jsonb,
	"delivered_at" timestamp with time zone NOT NULL,
	"viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_intent" (
	"id" text PRIMARY KEY,
	"event_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"recipient_user_id" text,
	"channel" "notification_channel" NOT NULL,
	"template_key" text NOT NULL,
	"title" text,
	"body" text,
	"metadata" jsonb,
	"status" "notification_intent_status" DEFAULT 'pending'::"notification_intent_status" NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"organization_id" text,
	"organization_scope_key" text DEFAULT 'global' NOT NULL,
	"event_type" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_start" integer,
	"quiet_hours_end" integer,
	"timezone" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_message" (
	"id" text PRIMARY KEY,
	"organization_id" text,
	"ticket_id" text,
	"channel" "inbound_message_channel" NOT NULL,
	"external_message_id" text NOT NULL,
	"external_thread_id" text,
	"external_sender_id" text,
	"sender_display_name" text,
	"dedupe_key" text NOT NULL,
	"normalized_text" text,
	"payload" jsonb NOT NULL,
	"status" "inbound_message_status" DEFAULT 'received'::"inbound_message_status" NOT NULL,
	"error_message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"booking_id" text,
	"customer_user_id" text,
	"created_by_user_id" text,
	"assigned_to_user_id" text,
	"resolved_by_user_id" text,
	"closed_by_user_id" text,
	"source" "support_ticket_source" DEFAULT 'manual'::"support_ticket_source" NOT NULL,
	"status" "support_ticket_status" DEFAULT 'open'::"support_ticket_status" NOT NULL,
	"priority" "support_ticket_priority" DEFAULT 'normal'::"support_ticket_priority" NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_message" (
	"id" text PRIMARY KEY,
	"ticket_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"author_user_id" text,
	"inbound_message_id" text,
	"channel" "support_message_channel" DEFAULT 'internal'::"support_message_channel" NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo" (
	"id" serial PRIMARY KEY,
	"text" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_execution" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"workflow_name" text NOT NULL,
	"idempotency_key" text NOT NULL UNIQUE,
	"status" "workflow_status" DEFAULT 'running'::"workflow_status" NOT NULL,
	"input_snapshot" jsonb,
	"output_snapshot" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_step_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" text NOT NULL,
	"step_name" text NOT NULL,
	"status" "workflow_step_status" DEFAULT 'running'::"workflow_step_status" NOT NULL,
	"input_snapshot" jsonb,
	"output_snapshot" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_referral_uq_code" ON "affiliate_referral" ("code");--> statement-breakpoint
CREATE INDEX "affiliate_referral_ix_affiliate_user_id" ON "affiliate_referral" ("affiliate_user_id");--> statement-breakpoint
CREATE INDEX "affiliate_referral_ix_affiliate_organization_id" ON "affiliate_referral" ("affiliate_organization_id");--> statement-breakpoint
CREATE INDEX "affiliate_referral_ix_status" ON "affiliate_referral" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_affiliate_attribution_uq_booking_id" ON "booking_affiliate_attribution" ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_affiliate_attribution_ix_affiliate_user_id" ON "booking_affiliate_attribution" ("affiliate_user_id");--> statement-breakpoint
CREATE INDEX "booking_affiliate_attribution_ix_referral_id" ON "booking_affiliate_attribution" ("referral_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_affiliate_payout_uq_attribution_id" ON "booking_affiliate_payout" ("attribution_id");--> statement-breakpoint
CREATE INDEX "booking_affiliate_payout_ix_booking_id" ON "booking_affiliate_payout" ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_affiliate_payout_ix_affiliate_user_id" ON "booking_affiliate_payout" ("affiliate_user_id");--> statement-breakpoint
CREATE INDEX "booking_affiliate_payout_ix_status" ON "booking_affiliate_payout" ("status");--> statement-breakpoint
CREATE INDEX "assistant_chat_user_idx" ON "assistant_chat" ("user_id");--> statement-breakpoint
CREATE INDEX "assistant_message_chat_idx" ON "assistant_message" ("chat_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" ("email");--> statement-breakpoint
CREATE INDEX "invitation_status_idx" ON "invitation" ("status");--> statement-breakpoint
CREATE INDEX "invitation_inviterId_idx" ON "invitation" ("inviter_id");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_unique" ON "member" ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_unique" ON "organization" ("slug");--> statement-breakpoint
CREATE INDEX "passkey_userId_idx" ON "passkey" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_credential_id_unique" ON "passkey" ("credential_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_calendar_link_uq_booking_id" ON "booking_calendar_link" ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_calendar_link_ix_calendar_connection_id" ON "booking_calendar_link" ("calendar_connection_id");--> statement-breakpoint
CREATE INDEX "calendar_webhook_event_ix_connection_id" ON "calendar_webhook_event" ("calendar_connection_id");--> statement-breakpoint
CREATE INDEX "calendar_webhook_event_ix_status" ON "calendar_webhook_event" ("status");--> statement-breakpoint
CREATE INDEX "calendar_webhook_event_ix_received_at" ON "calendar_webhook_event" ("received_at");--> statement-breakpoint
CREATE INDEX "listing_availability_block_ix_listing_id" ON "listing_availability_block" ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_availability_block_ix_calendar_connection_id" ON "listing_availability_block" ("calendar_connection_id");--> statement-breakpoint
CREATE INDEX "listing_availability_block_ix_starts_at" ON "listing_availability_block" ("starts_at");--> statement-breakpoint
CREATE INDEX "listing_availability_block_ix_source" ON "listing_availability_block" ("source");--> statement-breakpoint
CREATE INDEX "listing_availability_exception_ix_listing_id" ON "listing_availability_exception" ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_availability_exception_ix_date" ON "listing_availability_exception" ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_availability_exception_uq_listing_date" ON "listing_availability_exception" ("listing_id","date");--> statement-breakpoint
CREATE INDEX "listing_availability_rule_ix_listing_id" ON "listing_availability_rule" ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_availability_rule_uq_listing_day_start" ON "listing_availability_rule" ("listing_id","day_of_week","start_minute");--> statement-breakpoint
CREATE INDEX "listing_calendar_connection_ix_listing_id" ON "listing_calendar_connection" ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_calendar_connection_ix_organization_id" ON "listing_calendar_connection" ("organization_id");--> statement-breakpoint
CREATE INDEX "listing_calendar_connection_ix_calendar_account_id" ON "listing_calendar_connection" ("calendar_account_id");--> statement-breakpoint
CREATE INDEX "listing_calendar_connection_ix_calendar_source_id" ON "listing_calendar_connection" ("calendar_source_id");--> statement-breakpoint
CREATE INDEX "listing_calendar_connection_ix_sync_status" ON "listing_calendar_connection" ("sync_status");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_calendar_connection_uq_primary_listing" ON "listing_calendar_connection" ("listing_id") WHERE "is_primary" = true and "is_active" = true;--> statement-breakpoint
CREATE INDEX "listing_minimum_duration_rule_ix_listing_id" ON "listing_minimum_duration_rule" ("listing_id");--> statement-breakpoint
CREATE INDEX "organization_calendar_account_ix_organization_id" ON "organization_calendar_account" ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_calendar_account_ix_provider" ON "organization_calendar_account" ("provider");--> statement-breakpoint
CREATE INDEX "organization_calendar_account_ix_status" ON "organization_calendar_account" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_calendar_account_uq_org_provider_external" ON "organization_calendar_account" ("organization_id","provider","external_account_id");--> statement-breakpoint
CREATE INDEX "organization_calendar_source_ix_organization_id" ON "organization_calendar_source" ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_calendar_source_ix_calendar_account_id" ON "organization_calendar_source" ("calendar_account_id");--> statement-breakpoint
CREATE INDEX "organization_calendar_source_ix_provider" ON "organization_calendar_source" ("provider");--> statement-breakpoint
CREATE INDEX "organization_calendar_source_ix_is_active" ON "organization_calendar_source" ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_calendar_source_uq_account_external" ON "organization_calendar_source" ("calendar_account_id","external_calendar_id");--> statement-breakpoint
CREATE INDEX "user_consent_userId_idx" ON "user_consent" ("user_id");--> statement-breakpoint
CREATE INDEX "user_consent_type_idx" ON "user_consent" ("user_id","consent_type");--> statement-breakpoint
CREATE INDEX "listing_location_ix_organization_id" ON "listing_location" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_type_config_uq_slug" ON "listing_type_config" ("slug");--> statement-breakpoint
CREATE INDEX "organization_listing_type_ix_organization_id" ON "organization_listing_type" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_listing_type_uq_org_slug" ON "organization_listing_type" ("organization_id","listing_type_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_listing_type_uq_default" ON "organization_listing_type" ("organization_id") WHERE "is_default" = true;--> statement-breakpoint
CREATE INDEX "organization_manual_override_ix_organization_id" ON "organization_manual_override" ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_manual_override_ix_is_active" ON "organization_manual_override" ("is_active");--> statement-breakpoint
CREATE INDEX "organization_manual_override_ix_scope_type" ON "organization_manual_override" ("scope_type");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_onboarding_uq_organization_id" ON "organization_onboarding" ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_onboarding_ix_is_complete" ON "organization_onboarding" ("is_complete");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_settings_uq_organization_id" ON "organization_settings" ("organization_id");--> statement-breakpoint
CREATE INDEX "listing_ix_organization_id" ON "listing" ("organization_id");--> statement-breakpoint
CREATE INDEX "listing_ix_status" ON "listing" ("status");--> statement-breakpoint
CREATE INDEX "listing_ix_listing_type_slug" ON "listing" ("listing_type_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_uq_org_slug" ON "listing" ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "listing_amenity_ix_listing_id" ON "listing_amenity" ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_amenity_uq_listing_key" ON "listing_amenity" ("listing_id","key");--> statement-breakpoint
CREATE INDEX "listing_asset_ix_listing_id" ON "listing_asset" ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_asset_ix_kind" ON "listing_asset" ("kind");--> statement-breakpoint
CREATE INDEX "listing_asset_ix_storage_provider" ON "listing_asset" ("storage_provider");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_asset_uq_primary_image" ON "listing_asset" ("listing_id") WHERE "is_primary" = true and "kind" = 'image';--> statement-breakpoint
CREATE INDEX "listing_boat_rent_profile_ix_organization_id" ON "listing_boat_rent_profile" ("organization_id");--> statement-breakpoint
CREATE INDEX "listing_excursion_profile_ix_organization_id" ON "listing_excursion_profile" ("organization_id");--> statement-breakpoint
CREATE INDEX "listing_moderation_audit_ix_listing_id" ON "listing_moderation_audit" ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_moderation_audit_ix_organization_id" ON "listing_moderation_audit" ("organization_id");--> statement-breakpoint
CREATE INDEX "listing_moderation_audit_ix_acted_by_user_id" ON "listing_moderation_audit" ("acted_by_user_id");--> statement-breakpoint
CREATE INDEX "listing_moderation_audit_ix_acted_at" ON "listing_moderation_audit" ("acted_at");--> statement-breakpoint
CREATE INDEX "listing_pricing_profile_ix_listing_id" ON "listing_pricing_profile" ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_pricing_profile_ix_is_default" ON "listing_pricing_profile" ("is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_pricing_profile_uq_default" ON "listing_pricing_profile" ("listing_id") WHERE "is_default" = true and "archived_at" is null;--> statement-breakpoint
CREATE INDEX "listing_pricing_rule_ix_listing_id" ON "listing_pricing_rule" ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_pricing_rule_ix_pricing_profile_id" ON "listing_pricing_rule" ("pricing_profile_id");--> statement-breakpoint
CREATE INDEX "platform_fee_config_ix_currency" ON "platform_fee_config" ("currency");--> statement-breakpoint
CREATE INDEX "platform_fee_config_ix_is_active" ON "platform_fee_config" ("is_active");--> statement-breakpoint
CREATE INDEX "organization_payment_config_ix_organization_id" ON "organization_payment_config" ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_payment_config_ix_provider_config_id" ON "organization_payment_config" ("provider_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_payment_config_uq_org_provider" ON "organization_payment_config" ("organization_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_payment_config_uq_webhook_endpoint_id" ON "organization_payment_config" ("webhook_endpoint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_config_uq_provider" ON "payment_provider_config" ("provider");--> statement-breakpoint
CREATE INDEX "payment_webhook_event_ix_organization_id_created_at" ON "payment_webhook_event" ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_webhook_event_ix_endpoint_id" ON "payment_webhook_event" ("endpoint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_event_uq_request_signature" ON "payment_webhook_event" ("request_signature") WHERE "request_signature" is not null;--> statement-breakpoint
CREATE INDEX "listing_publication_ix_listing_id" ON "listing_publication" ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_publication_ix_organization_id" ON "listing_publication" ("organization_id");--> statement-breakpoint
CREATE INDEX "listing_publication_ix_channel_type" ON "listing_publication" ("channel_type");--> statement-breakpoint
CREATE INDEX "listing_publication_ix_merchant_payment_config_id" ON "listing_publication" ("merchant_payment_config_id");--> statement-breakpoint
CREATE INDEX "listing_publication_ix_pricing_profile_id" ON "listing_publication" ("pricing_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_publication_uq_listing_channel" ON "listing_publication" ("listing_id","channel_type","channel_id");--> statement-breakpoint
CREATE INDEX "booking_ix_organization_id" ON "booking" ("organization_id");--> statement-breakpoint
CREATE INDEX "booking_ix_listing_id" ON "booking" ("listing_id");--> statement-breakpoint
CREATE INDEX "booking_ix_customer_user_id" ON "booking" ("customer_user_id");--> statement-breakpoint
CREATE INDEX "booking_ix_status" ON "booking" ("status");--> statement-breakpoint
CREATE INDEX "booking_ix_payment_status" ON "booking" ("payment_status");--> statement-breakpoint
CREATE INDEX "booking_ix_starts_at" ON "booking" ("starts_at");--> statement-breakpoint
CREATE INDEX "booking_ix_publication_id" ON "booking" ("publication_id");--> statement-breakpoint
CREATE INDEX "booking_ix_merchant_organization_id" ON "booking" ("merchant_organization_id");--> statement-breakpoint
CREATE INDEX "booking_ix_merchant_payment_config_id" ON "booking" ("merchant_payment_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_uq_org_source_external_ref" ON "booking" ("organization_id","source","external_ref");--> statement-breakpoint
CREATE INDEX "booking_cancellation_request_ix_organization_id" ON "booking_cancellation_request" ("organization_id");--> statement-breakpoint
CREATE INDEX "booking_cancellation_request_ix_status" ON "booking_cancellation_request" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_cancellation_request_uq_booking_id" ON "booking_cancellation_request" ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_discount_application_ix_booking_id" ON "booking_discount_application" ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_discount_application_ix_discount_code_id" ON "booking_discount_application" ("discount_code_id");--> statement-breakpoint
CREATE INDEX "booking_discount_application_ix_discount_code_id_customer_user_id" ON "booking_discount_application" ("discount_code_id","customer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_discount_application_uq_booking_id" ON "booking_discount_application" ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_discount_code_ix_organization_id_is_active" ON "booking_discount_code" ("organization_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_discount_code_uq_org_code" ON "booking_discount_code" ("organization_id","code");--> statement-breakpoint
CREATE INDEX "booking_dispute_ix_booking_id" ON "booking_dispute" ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_dispute_ix_organization_id" ON "booking_dispute" ("organization_id");--> statement-breakpoint
CREATE INDEX "booking_dispute_ix_status" ON "booking_dispute" ("status");--> statement-breakpoint
CREATE INDEX "booking_payment_attempt_ix_booking_id" ON "booking_payment_attempt" ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_payment_attempt_ix_organization_id" ON "booking_payment_attempt" ("organization_id");--> statement-breakpoint
CREATE INDEX "booking_payment_attempt_ix_status" ON "booking_payment_attempt" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_payment_attempt_uq_booking_idempotency" ON "booking_payment_attempt" ("booking_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_payment_attempt_uq_provider_intent" ON "booking_payment_attempt" ("provider","provider_intent_id");--> statement-breakpoint
CREATE INDEX "booking_refund_ix_booking_id" ON "booking_refund" ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_refund_ix_organization_id" ON "booking_refund" ("organization_id");--> statement-breakpoint
CREATE INDEX "booking_refund_ix_status" ON "booking_refund" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_refund_uq_provider_external_refund_id" ON "booking_refund" ("provider","external_refund_id");--> statement-breakpoint
CREATE INDEX "booking_shift_request_ix_organization_id" ON "booking_shift_request" ("organization_id");--> statement-breakpoint
CREATE INDEX "booking_shift_request_ix_status" ON "booking_shift_request" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_shift_request_uq_booking_id" ON "booking_shift_request" ("booking_id");--> statement-breakpoint
CREATE INDEX "cancellation_policy_ix_organization_id" ON "cancellation_policy" ("organization_id");--> statement-breakpoint
CREATE INDEX "cancellation_policy_ix_listing_id" ON "cancellation_policy" ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cancellation_policy_uq_listing_id" ON "cancellation_policy" ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cancellation_policy_uq_org_scope" ON "cancellation_policy" ("organization_id","scope");--> statement-breakpoint
CREATE INDEX "listing_review_ix_listing_id_status" ON "listing_review" ("listing_id","status");--> statement-breakpoint
CREATE INDEX "listing_review_ix_organization_id" ON "listing_review" ("organization_id");--> statement-breakpoint
CREATE INDEX "listing_review_ix_reviewer_user_id" ON "listing_review" ("reviewer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_review_uq_booking_id" ON "listing_review" ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_review_response_uq_review_id" ON "listing_review_response" ("review_id");--> statement-breakpoint
CREATE INDEX "booking_staff_assignment_ix_booking_id" ON "booking_staff_assignment" ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_staff_assignment_ix_member_id" ON "booking_staff_assignment" ("member_id");--> statement-breakpoint
CREATE INDEX "booking_staff_assignment_ix_organization_id" ON "booking_staff_assignment" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_staff_assignment_uq_booking_member" ON "booking_staff_assignment" ("booking_id","member_id");--> statement-breakpoint
CREATE INDEX "listing_staff_assignment_ix_listing_id" ON "listing_staff_assignment" ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_staff_assignment_ix_member_id" ON "listing_staff_assignment" ("member_id");--> statement-breakpoint
CREATE INDEX "listing_staff_assignment_ix_organization_id" ON "listing_staff_assignment" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_staff_assignment_uq_listing_member" ON "listing_staff_assignment" ("listing_id","member_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_intentId_idx" ON "notification_delivery" ("intent_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_organizationId_idx" ON "notification_delivery" ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_provider_idx" ON "notification_delivery" ("provider");--> statement-breakpoint
CREATE INDEX "notification_delivery_status_idx" ON "notification_delivery" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_intent_attempt_unique" ON "notification_delivery" ("intent_id","attempt");--> statement-breakpoint
CREATE INDEX "notification_event_organizationId_idx" ON "notification_event" ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_event_eventType_idx" ON "notification_event" ("event_type");--> statement-breakpoint
CREATE INDEX "notification_event_status_idx" ON "notification_event" ("status");--> statement-breakpoint
CREATE INDEX "notification_event_createdAt_idx" ON "notification_event" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_event_org_idempotency_unique" ON "notification_event" ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_in_app_eventId_idx" ON "notification_in_app" ("event_id");--> statement-breakpoint
CREATE INDEX "notification_in_app_intentId_idx" ON "notification_in_app" ("intent_id");--> statement-breakpoint
CREATE INDEX "notification_in_app_organizationId_idx" ON "notification_in_app" ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_in_app_userId_idx" ON "notification_in_app" ("user_id");--> statement-breakpoint
CREATE INDEX "notification_in_app_viewedAt_idx" ON "notification_in_app" ("viewed_at");--> statement-breakpoint
CREATE INDEX "notification_in_app_deliveredAt_idx" ON "notification_in_app" ("delivered_at");--> statement-breakpoint
CREATE INDEX "notification_intent_eventId_idx" ON "notification_intent" ("event_id");--> statement-breakpoint
CREATE INDEX "notification_intent_organizationId_idx" ON "notification_intent" ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_intent_recipientUserId_idx" ON "notification_intent" ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "notification_intent_channel_idx" ON "notification_intent" ("channel");--> statement-breakpoint
CREATE INDEX "notification_intent_status_idx" ON "notification_intent" ("status");--> statement-breakpoint
CREATE INDEX "notification_preference_userId_idx" ON "notification_preference" ("user_id");--> statement-breakpoint
CREATE INDEX "notification_preference_organizationId_idx" ON "notification_preference" ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_preference_eventType_idx" ON "notification_preference" ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_scope_unique" ON "notification_preference" ("user_id","organization_scope_key","event_type","channel");--> statement-breakpoint
CREATE INDEX "inbound_message_ix_organization_id" ON "inbound_message" ("organization_id");--> statement-breakpoint
CREATE INDEX "inbound_message_ix_ticket_id" ON "inbound_message" ("ticket_id");--> statement-breakpoint
CREATE INDEX "inbound_message_ix_channel" ON "inbound_message" ("channel");--> statement-breakpoint
CREATE INDEX "inbound_message_ix_status" ON "inbound_message" ("status");--> statement-breakpoint
CREATE INDEX "inbound_message_ix_received_at" ON "inbound_message" ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_message_uq_channel_dedupe" ON "inbound_message" ("channel","dedupe_key");--> statement-breakpoint
CREATE INDEX "support_ticket_ix_organization_id" ON "support_ticket" ("organization_id");--> statement-breakpoint
CREATE INDEX "support_ticket_ix_status" ON "support_ticket" ("status");--> statement-breakpoint
CREATE INDEX "support_ticket_ix_priority" ON "support_ticket" ("priority");--> statement-breakpoint
CREATE INDEX "support_ticket_ix_assigned_to_user_id" ON "support_ticket" ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "support_ticket_ix_due_at" ON "support_ticket" ("due_at");--> statement-breakpoint
CREATE INDEX "support_ticket_ix_booking_id" ON "support_ticket" ("booking_id");--> statement-breakpoint
CREATE INDEX "support_ticket_ix_customer_user_id" ON "support_ticket" ("customer_user_id");--> statement-breakpoint
CREATE INDEX "support_ticket_message_ix_ticket_id" ON "support_ticket_message" ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_ticket_message_ix_organization_id" ON "support_ticket_message" ("organization_id");--> statement-breakpoint
CREATE INDEX "support_ticket_message_ix_inbound_message_id" ON "support_ticket_message" ("inbound_message_id");--> statement-breakpoint
CREATE INDEX "support_ticket_message_ix_channel" ON "support_ticket_message" ("channel");--> statement-breakpoint
CREATE INDEX "support_ticket_message_ix_created_at" ON "support_ticket_message" ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_step_log_ix_execution_id" ON "workflow_step_log" ("execution_id");--> statement-breakpoint
ALTER TABLE "affiliate_referral" ADD CONSTRAINT "affiliate_referral_affiliate_user_id_user_id_fkey" FOREIGN KEY ("affiliate_user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "affiliate_referral" ADD CONSTRAINT "affiliate_referral_vgOUvH4F38sd_fkey" FOREIGN KEY ("affiliate_organization_id") REFERENCES "organization"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_affiliate_attribution" ADD CONSTRAINT "booking_affiliate_attribution_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_affiliate_attribution" ADD CONSTRAINT "booking_affiliate_attribution_affiliate_user_id_user_id_fkey" FOREIGN KEY ("affiliate_user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_affiliate_attribution" ADD CONSTRAINT "booking_affiliate_attribution_C0JyysfcTB7Z_fkey" FOREIGN KEY ("referral_id") REFERENCES "affiliate_referral"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "booking_affiliate_payout" ADD CONSTRAINT "booking_affiliate_payout_SLg2Fdw5enm4_fkey" FOREIGN KEY ("attribution_id") REFERENCES "booking_affiliate_attribution"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_affiliate_payout" ADD CONSTRAINT "booking_affiliate_payout_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_affiliate_payout" ADD CONSTRAINT "booking_affiliate_payout_affiliate_user_id_user_id_fkey" FOREIGN KEY ("affiliate_user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_chat" ADD CONSTRAINT "assistant_chat_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_chat_id_assistant_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "assistant_chat"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_calendar_link" ADD CONSTRAINT "booking_calendar_link_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_calendar_link" ADD CONSTRAINT "booking_calendar_link_D4hitEDYxMue_fkey" FOREIGN KEY ("calendar_connection_id") REFERENCES "listing_calendar_connection"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "calendar_webhook_event" ADD CONSTRAINT "calendar_webhook_event_UzsPKCqkU54c_fkey" FOREIGN KEY ("calendar_connection_id") REFERENCES "listing_calendar_connection"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_availability_block" ADD CONSTRAINT "listing_availability_block_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_availability_block" ADD CONSTRAINT "listing_availability_block_IdMrYVBecWe1_fkey" FOREIGN KEY ("calendar_connection_id") REFERENCES "listing_calendar_connection"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_availability_block" ADD CONSTRAINT "listing_availability_block_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_availability_exception" ADD CONSTRAINT "listing_availability_exception_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_availability_exception" ADD CONSTRAINT "listing_availability_exception_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_availability_rule" ADD CONSTRAINT "listing_availability_rule_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_calendar_connection" ADD CONSTRAINT "listing_calendar_connection_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_calendar_connection" ADD CONSTRAINT "listing_calendar_connection_0IUE85gpVsTK_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_calendar_connection" ADD CONSTRAINT "listing_calendar_connection_6n1o2Fplc7Xw_fkey" FOREIGN KEY ("calendar_account_id") REFERENCES "organization_calendar_account"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_calendar_connection" ADD CONSTRAINT "listing_calendar_connection_dyI4XQejWZ50_fkey" FOREIGN KEY ("calendar_source_id") REFERENCES "organization_calendar_source"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_calendar_connection" ADD CONSTRAINT "listing_calendar_connection_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_minimum_duration_rule" ADD CONSTRAINT "listing_minimum_duration_rule_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_calendar_account" ADD CONSTRAINT "organization_calendar_account_dq1XdkZg5kAo_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_calendar_account" ADD CONSTRAINT "organization_calendar_account_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "organization_calendar_source" ADD CONSTRAINT "organization_calendar_source_uefSSSe8vX6I_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_calendar_source" ADD CONSTRAINT "organization_calendar_source_jw18fLR5L3kK_fkey" FOREIGN KEY ("calendar_account_id") REFERENCES "organization_calendar_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_consent" ADD CONSTRAINT "user_consent_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_location" ADD CONSTRAINT "listing_location_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_listing_type" ADD CONSTRAINT "organization_listing_type_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_listing_type" ADD CONSTRAINT "organization_listing_type_JL5jkVLcq3qy_fkey" FOREIGN KEY ("listing_type_slug") REFERENCES "listing_type_config"("slug") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_manual_override" ADD CONSTRAINT "organization_manual_override_aWURKwHAweAL_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_manual_override" ADD CONSTRAINT "organization_manual_override_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "organization_manual_override" ADD CONSTRAINT "organization_manual_override_resolved_by_user_id_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "organization_onboarding" ADD CONSTRAINT "organization_onboarding_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_listing_type_slug_listing_type_config_slug_fkey" FOREIGN KEY ("listing_type_slug") REFERENCES "listing_type_config"("slug") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_location_id_listing_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "listing_location"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_amenity" ADD CONSTRAINT "listing_amenity_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_asset" ADD CONSTRAINT "listing_asset_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_boat_rent_profile" ADD CONSTRAINT "listing_boat_rent_profile_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_boat_rent_profile" ADD CONSTRAINT "listing_boat_rent_profile_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_excursion_profile" ADD CONSTRAINT "listing_excursion_profile_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_excursion_profile" ADD CONSTRAINT "listing_excursion_profile_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_moderation_audit" ADD CONSTRAINT "listing_moderation_audit_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_moderation_audit" ADD CONSTRAINT "listing_moderation_audit_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_moderation_audit" ADD CONSTRAINT "listing_moderation_audit_acted_by_user_id_user_id_fkey" FOREIGN KEY ("acted_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_pricing_profile" ADD CONSTRAINT "listing_pricing_profile_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_pricing_profile" ADD CONSTRAINT "listing_pricing_profile_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_pricing_rule" ADD CONSTRAINT "listing_pricing_rule_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_pricing_rule" ADD CONSTRAINT "listing_pricing_rule_9Ta6L0o2dwsN_fkey" FOREIGN KEY ("pricing_profile_id") REFERENCES "listing_pricing_profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "platform_fee_config" ADD CONSTRAINT "platform_fee_config_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "organization_payment_config" ADD CONSTRAINT "organization_payment_config_z6SRvPuXjpX3_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_payment_config" ADD CONSTRAINT "organization_payment_config_SFos6AfhPqDK_fkey" FOREIGN KEY ("provider_config_id") REFERENCES "payment_provider_config"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "payment_webhook_event" ADD CONSTRAINT "payment_webhook_event_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_publication" ADD CONSTRAINT "listing_publication_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_publication" ADD CONSTRAINT "listing_publication_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_publication" ADD CONSTRAINT "listing_publication_0J9S1V8n0kCa_fkey" FOREIGN KEY ("merchant_payment_config_id") REFERENCES "organization_payment_config"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_publication" ADD CONSTRAINT "listing_publication_jxkMC82giMMM_fkey" FOREIGN KEY ("pricing_profile_id") REFERENCES "listing_pricing_profile"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_publication_id_listing_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "listing_publication"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_merchant_organization_id_organization_id_fkey" FOREIGN KEY ("merchant_organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_RPpmGXJwQpPq_fkey" FOREIGN KEY ("merchant_payment_config_id") REFERENCES "organization_payment_config"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_customer_user_id_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_cancelled_by_user_id_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_cancellation_request" ADD CONSTRAINT "booking_cancellation_request_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_cancellation_request" ADD CONSTRAINT "booking_cancellation_request_DTO2e9B5t2U3_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_cancellation_request" ADD CONSTRAINT "booking_cancellation_request_requested_by_user_id_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_cancellation_request" ADD CONSTRAINT "booking_cancellation_request_ccrPmfXIng5N_fkey" FOREIGN KEY ("customer_decision_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_cancellation_request" ADD CONSTRAINT "booking_cancellation_request_nMPTUivLw7kU_fkey" FOREIGN KEY ("manager_decision_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_cancellation_request" ADD CONSTRAINT "booking_cancellation_request_applied_by_user_id_user_id_fkey" FOREIGN KEY ("applied_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_discount_application" ADD CONSTRAINT "booking_discount_application_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_discount_application" ADD CONSTRAINT "booking_discount_application_7DZcCUpgSbt4_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "booking_discount_code"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "booking_discount_application" ADD CONSTRAINT "booking_discount_application_customer_user_id_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_discount_code" ADD CONSTRAINT "booking_discount_code_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_discount_code" ADD CONSTRAINT "booking_discount_code_applies_to_listing_id_listing_id_fkey" FOREIGN KEY ("applies_to_listing_id") REFERENCES "listing"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_discount_code" ADD CONSTRAINT "booking_discount_code_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_dispute" ADD CONSTRAINT "booking_dispute_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_dispute" ADD CONSTRAINT "booking_dispute_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_dispute" ADD CONSTRAINT "booking_dispute_raised_by_user_id_user_id_fkey" FOREIGN KEY ("raised_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_dispute" ADD CONSTRAINT "booking_dispute_resolved_by_user_id_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_payment_attempt" ADD CONSTRAINT "booking_payment_attempt_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_payment_attempt" ADD CONSTRAINT "booking_payment_attempt_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_payment_attempt" ADD CONSTRAINT "booking_payment_attempt_requested_by_user_id_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_refund" ADD CONSTRAINT "booking_refund_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_refund" ADD CONSTRAINT "booking_refund_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_refund" ADD CONSTRAINT "booking_refund_requested_by_user_id_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_refund" ADD CONSTRAINT "booking_refund_approved_by_user_id_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_refund" ADD CONSTRAINT "booking_refund_processed_by_user_id_user_id_fkey" FOREIGN KEY ("processed_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_shift_request" ADD CONSTRAINT "booking_shift_request_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_shift_request" ADD CONSTRAINT "booking_shift_request_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_shift_request" ADD CONSTRAINT "booking_shift_request_requested_by_user_id_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_shift_request" ADD CONSTRAINT "booking_shift_request_customer_decision_by_user_id_user_id_fkey" FOREIGN KEY ("customer_decision_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_shift_request" ADD CONSTRAINT "booking_shift_request_manager_decision_by_user_id_user_id_fkey" FOREIGN KEY ("manager_decision_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_shift_request" ADD CONSTRAINT "booking_shift_request_rejected_by_user_id_user_id_fkey" FOREIGN KEY ("rejected_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_shift_request" ADD CONSTRAINT "booking_shift_request_applied_by_user_id_user_id_fkey" FOREIGN KEY ("applied_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "cancellation_policy" ADD CONSTRAINT "cancellation_policy_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cancellation_policy" ADD CONSTRAINT "cancellation_policy_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_review" ADD CONSTRAINT "listing_review_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_review" ADD CONSTRAINT "listing_review_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_review" ADD CONSTRAINT "listing_review_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_review" ADD CONSTRAINT "listing_review_reviewer_user_id_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_review" ADD CONSTRAINT "listing_review_moderated_by_user_id_user_id_fkey" FOREIGN KEY ("moderated_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_review_response" ADD CONSTRAINT "listing_review_response_review_id_listing_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "listing_review"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_review_response" ADD CONSTRAINT "listing_review_response_author_user_id_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking_staff_assignment" ADD CONSTRAINT "booking_staff_assignment_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_staff_assignment" ADD CONSTRAINT "booking_staff_assignment_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_staff_assignment" ADD CONSTRAINT "booking_staff_assignment_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_staff_assignment" ADD CONSTRAINT "booking_staff_assignment_assigned_by_user_id_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "listing_staff_assignment" ADD CONSTRAINT "listing_staff_assignment_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_staff_assignment" ADD CONSTRAINT "listing_staff_assignment_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_staff_assignment" ADD CONSTRAINT "listing_staff_assignment_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_intent_id_notification_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "notification_intent"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_in_app" ADD CONSTRAINT "notification_in_app_event_id_notification_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "notification_event"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_in_app" ADD CONSTRAINT "notification_in_app_intent_id_notification_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "notification_intent"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_in_app" ADD CONSTRAINT "notification_in_app_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_in_app" ADD CONSTRAINT "notification_in_app_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_intent" ADD CONSTRAINT "notification_intent_event_id_notification_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "notification_event"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_intent" ADD CONSTRAINT "notification_intent_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_intent" ADD CONSTRAINT "notification_intent_recipient_user_id_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inbound_message" ADD CONSTRAINT "inbound_message_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inbound_message" ADD CONSTRAINT "inbound_message_ticket_id_support_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_ticket"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_booking_id_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_customer_user_id_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_assigned_to_user_id_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_resolved_by_user_id_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_closed_by_user_id_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "support_ticket_message" ADD CONSTRAINT "support_ticket_message_ticket_id_support_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_ticket"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "support_ticket_message" ADD CONSTRAINT "support_ticket_message_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "support_ticket_message" ADD CONSTRAINT "support_ticket_message_author_user_id_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "support_ticket_message" ADD CONSTRAINT "support_ticket_message_DZD3Dtph6AOS_fkey" FOREIGN KEY ("inbound_message_id") REFERENCES "inbound_message"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_step_log" ADD CONSTRAINT "workflow_step_log_execution_id_workflow_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_execution"("id") ON DELETE CASCADE;