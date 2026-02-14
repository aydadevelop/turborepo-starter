CREATE TABLE `affiliate_referral` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL,
	`affiliate_user_id` text NOT NULL,
	`organization_id` text,
	`name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`attribution_window_days` integer DEFAULT 30 NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_affiliate_referral_affiliate_user_id_user_id_fk` FOREIGN KEY (`affiliate_user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_affiliate_referral_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `booking_affiliate_attribution` (
	`id` text PRIMARY KEY,
	`booking_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`affiliate_user_id` text NOT NULL,
	`referral_id` text,
	`referral_code` text NOT NULL,
	`source` text DEFAULT 'cookie' NOT NULL,
	`clicked_at` integer,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_booking_affiliate_attribution_booking_id_booking_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_affiliate_attribution_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_affiliate_attribution_affiliate_user_id_user_id_fk` FOREIGN KEY (`affiliate_user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_affiliate_attribution_referral_id_affiliate_referral_id_fk` FOREIGN KEY (`referral_id`) REFERENCES `affiliate_referral`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `booking_affiliate_payout` (
	`id` text PRIMARY KEY,
	`attribution_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`affiliate_user_id` text NOT NULL,
	`commission_amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`eligible_at` integer,
	`paid_at` integer,
	`voided_at` integer,
	`void_reason` text,
	`external_payout_ref` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_booking_affiliate_payout_attribution_id_booking_affiliate_attribution_id_fk` FOREIGN KEY (`attribution_id`) REFERENCES `booking_affiliate_attribution`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_affiliate_payout_booking_id_booking_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_affiliate_payout_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_affiliate_payout_affiliate_user_id_user_id_fk` FOREIGN KEY (`affiliate_user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`inviter_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_invitation_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_invitation_inviter_id_user_id_fk` FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_member_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_member_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer DEFAULT false NOT NULL,
	`transports` text,
	`aaguid` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_passkey_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`active_organization_id` text,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `boat` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`dock_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'other' NOT NULL,
	`passenger_capacity` integer DEFAULT 1 NOT NULL,
	`crew_capacity` integer DEFAULT 0 NOT NULL,
	`minimum_hours` integer DEFAULT 1 NOT NULL,
	`minimum_notice_minutes` integer DEFAULT 0 NOT NULL,
	`allow_shift_requests` integer DEFAULT true NOT NULL,
	`working_hours_start` integer DEFAULT 9 NOT NULL,
	`working_hours_end` integer DEFAULT 21 NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`approved_at` integer,
	`archived_at` integer,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_boat_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_boat_dock_id_boat_dock_id_fk` FOREIGN KEY (`dock_id`) REFERENCES `boat_dock`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `boat_amenity` (
	`id` text PRIMARY KEY,
	`boat_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`value` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_boat_amenity_boat_id_boat_id_fk` FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `boat_asset` (
	`id` text PRIMARY KEY,
	`boat_id` text NOT NULL,
	`asset_type` text NOT NULL,
	`purpose` text DEFAULT 'gallery' NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text,
	`mime_type` text,
	`size_bytes` integer,
	`uploaded_by_user_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`review_note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_boat_asset_boat_id_boat_id_fk` FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_boat_asset_uploaded_by_user_id_user_id_fk` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `boat_availability_block` (
	`id` text PRIMARY KEY,
	`boat_id` text NOT NULL,
	`calendar_connection_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_ref` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`reason` text,
	`created_by_user_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_boat_availability_block_boat_id_boat_id_fk` FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_boat_availability_block_calendar_connection_id_boat_calendar_connection_id_fk` FOREIGN KEY (`calendar_connection_id`) REFERENCES `boat_calendar_connection`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_boat_availability_block_created_by_user_id_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `boat_availability_rule` (
	`id` text PRIMARY KEY,
	`boat_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_boat_availability_rule_boat_id_boat_id_fk` FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `boat_calendar_connection` (
	`id` text PRIMARY KEY,
	`boat_id` text NOT NULL,
	`provider` text DEFAULT 'manual' NOT NULL,
	`external_calendar_id` text NOT NULL,
	`sync_token` text,
	`watch_channel_id` text,
	`watch_resource_id` text,
	`watch_expires_at` integer,
	`last_synced_at` integer,
	`sync_status` text DEFAULT 'idle' NOT NULL,
	`last_error` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_boat_calendar_connection_boat_id_boat_id_fk` FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `boat_dock` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`address` text,
	`latitude` real,
	`longitude` real,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_boat_dock_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `boat_minimum_duration_rule` (
	`id` text PRIMARY KEY,
	`boat_id` text NOT NULL,
	`name` text NOT NULL,
	`start_hour` integer DEFAULT 0 NOT NULL,
	`start_minute` integer DEFAULT 0 NOT NULL,
	`end_hour` integer DEFAULT 24 NOT NULL,
	`end_minute` integer DEFAULT 0 NOT NULL,
	`minimum_duration_minutes` integer DEFAULT 60 NOT NULL,
	`days_of_week` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_boat_minimum_duration_rule_boat_id_boat_id_fk` FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON DELETE CASCADE,
	CHECK (`start_hour` >= 0 AND `start_hour` <= 23),
	CHECK (`start_minute` IN (0, 30)),
	CHECK (`end_hour` >= 0 AND `end_hour` <= 24),
	CHECK (`end_minute` IN (0, 30)),
	CHECK (NOT (`end_hour` = 24 AND `end_minute` != 0)),
	CHECK (`minimum_duration_minutes` >= 30 AND `minimum_duration_minutes` <= 1440)
);
--> statement-breakpoint
CREATE TABLE `boat_pricing_profile` (
	`id` text PRIMARY KEY,
	`boat_id` text NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`base_hourly_price_cents` integer NOT NULL,
	`minimum_hours` integer DEFAULT 1 NOT NULL,
	`deposit_percentage` integer DEFAULT 0 NOT NULL,
	`service_fee_percentage` integer DEFAULT 0 NOT NULL,
	`affiliate_fee_percentage` integer DEFAULT 0 NOT NULL,
	`tax_percentage` integer DEFAULT 0 NOT NULL,
	`acquiring_fee_percentage` integer DEFAULT 0 NOT NULL,
	`valid_from` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`valid_to` integer,
	`is_default` integer DEFAULT false NOT NULL,
	`created_by_user_id` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_boat_pricing_profile_boat_id_boat_id_fk` FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_boat_pricing_profile_created_by_user_id_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `boat_pricing_rule` (
	`id` text PRIMARY KEY,
	`boat_id` text NOT NULL,
	`pricing_profile_id` text,
	`name` text NOT NULL,
	`rule_type` text NOT NULL,
	`condition_json` text DEFAULT '{}' NOT NULL,
	`adjustment_type` text NOT NULL,
	`adjustment_value` integer NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_boat_pricing_rule_boat_id_boat_id_fk` FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_boat_pricing_rule_pricing_profile_id_boat_pricing_profile_id_fk` FOREIGN KEY (`pricing_profile_id`) REFERENCES `boat_pricing_profile`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `calendar_webhook_event` (
	`id` text PRIMARY KEY,
	`provider` text NOT NULL,
	`channel_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`message_number` integer,
	`resource_state` text NOT NULL,
	`channel_token` text,
	`resource_uri` text,
	`calendar_connection_id` text,
	`status` text DEFAULT 'processed' NOT NULL,
	`error_message` text,
	`received_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`processed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_calendar_webhook_event_calendar_connection_id_boat_calendar_connection_id_fk` FOREIGN KEY (`calendar_connection_id`) REFERENCES `boat_calendar_connection`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `booking` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`boat_id` text NOT NULL,
	`customer_user_id` text,
	`created_by_user_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`calendar_sync_status` text DEFAULT 'pending' NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`passengers` integer DEFAULT 1 NOT NULL,
	`contact_name` text,
	`contact_phone` text,
	`contact_email` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`base_price_cents` integer DEFAULT 0 NOT NULL,
	`discount_amount_cents` integer DEFAULT 0 NOT NULL,
	`total_price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`notes` text,
	`special_requests` text,
	`external_ref` text,
	`cancelled_at` integer,
	`cancelled_by_user_id` text,
	`cancellation_reason` text,
	`refund_amount_cents` integer,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_booking_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_boat_id_boat_id_fk` FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_customer_user_id_user_id_fk` FOREIGN KEY (`customer_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_booking_created_by_user_id_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_booking_cancelled_by_user_id_user_id_fk` FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `booking_calendar_link` (
	`id` text PRIMARY KEY,
	`booking_id` text NOT NULL,
	`boat_calendar_connection_id` text,
	`provider` text DEFAULT 'manual' NOT NULL,
	`external_calendar_id` text,
	`external_event_id` text NOT NULL,
	`ical_uid` text,
	`external_event_version` text,
	`synced_at` integer,
	`sync_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_booking_calendar_link_booking_id_booking_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_calendar_link_boat_calendar_connection_id_boat_calendar_connection_id_fk` FOREIGN KEY (`boat_calendar_connection_id`) REFERENCES `boat_calendar_connection`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `booking_cancellation_request` (
	`id` text PRIMARY KEY,
	`booking_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`requested_by_user_id` text,
	`reason` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`requested_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_booking_cancellation_request_booking_id_booking_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_cancellation_request_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_cancellation_request_requested_by_user_id_user_id_fk` FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_booking_cancellation_request_reviewed_by_user_id_user_id_fk` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `booking_discount_application` (
	`id` text PRIMARY KEY,
	`booking_id` text NOT NULL,
	`discount_code_id` text,
	`code` text NOT NULL,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`applied_amount_cents` integer NOT NULL,
	`applied_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_booking_discount_application_booking_id_booking_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_discount_application_discount_code_id_booking_discount_code_id_fk` FOREIGN KEY (`discount_code_id`) REFERENCES `booking_discount_code`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `booking_discount_code` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`max_discount_cents` integer,
	`minimum_subtotal_cents` integer DEFAULT 0 NOT NULL,
	`valid_from` integer,
	`valid_to` integer,
	`usage_limit` integer,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`per_customer_limit` integer,
	`applies_to_boat_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by_user_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_booking_discount_code_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_discount_code_applies_to_boat_id_boat_id_fk` FOREIGN KEY (`applies_to_boat_id`) REFERENCES `boat`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_booking_discount_code_created_by_user_id_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `booking_dispute` (
	`id` text PRIMARY KEY,
	`booking_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`raised_by_user_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`reason_code` text,
	`details` text,
	`resolution` text,
	`resolved_by_user_id` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_booking_dispute_booking_id_booking_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_dispute_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_dispute_raised_by_user_id_user_id_fk` FOREIGN KEY (`raised_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_booking_dispute_resolved_by_user_id_user_id_fk` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `booking_payment_attempt` (
	`id` text PRIMARY KEY,
	`booking_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`requested_by_user_id` text,
	`provider` text DEFAULT 'manual' NOT NULL,
	`idempotency_key` text NOT NULL,
	`provider_intent_id` text,
	`status` text DEFAULT 'initiated' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`failure_reason` text,
	`metadata` text,
	`processed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_booking_payment_attempt_booking_id_booking_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_payment_attempt_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_payment_attempt_requested_by_user_id_user_id_fk` FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `booking_refund` (
	`id` text PRIMARY KEY,
	`booking_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`requested_by_user_id` text,
	`approved_by_user_id` text,
	`processed_by_user_id` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`reason` text,
	`provider` text,
	`external_refund_id` text,
	`failure_reason` text,
	`metadata` text,
	`requested_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`approved_at` integer,
	`processed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_booking_refund_booking_id_booking_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_refund_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_refund_requested_by_user_id_user_id_fk` FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_booking_refund_approved_by_user_id_user_id_fk` FOREIGN KEY (`approved_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_booking_refund_processed_by_user_id_user_id_fk` FOREIGN KEY (`processed_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `booking_shift_request` (
	`id` text PRIMARY KEY,
	`booking_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`requested_by_user_id` text,
	`initiated_by_role` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`customer_decision` text DEFAULT 'pending' NOT NULL,
	`customer_decision_by_user_id` text,
	`customer_decision_at` integer,
	`customer_decision_note` text,
	`manager_decision` text DEFAULT 'pending' NOT NULL,
	`manager_decision_by_user_id` text,
	`manager_decision_at` integer,
	`manager_decision_note` text,
	`current_starts_at` integer NOT NULL,
	`current_ends_at` integer NOT NULL,
	`proposed_starts_at` integer NOT NULL,
	`proposed_ends_at` integer NOT NULL,
	`current_passengers` integer NOT NULL,
	`proposed_passengers` integer NOT NULL,
	`current_base_price_cents` integer DEFAULT 0 NOT NULL,
	`current_discount_amount_cents` integer DEFAULT 0 NOT NULL,
	`proposed_base_price_cents` integer DEFAULT 0 NOT NULL,
	`proposed_discount_amount_cents` integer DEFAULT 0 NOT NULL,
	`current_total_price_cents` integer DEFAULT 0 NOT NULL,
	`proposed_total_price_cents` integer DEFAULT 0 NOT NULL,
	`current_pay_now_cents` integer DEFAULT 0 NOT NULL,
	`proposed_pay_now_cents` integer DEFAULT 0 NOT NULL,
	`price_delta_cents` integer DEFAULT 0 NOT NULL,
	`pay_now_delta_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`discount_code` text,
	`reason` text,
	`rejected_by_user_id` text,
	`rejected_at` integer,
	`rejection_reason` text,
	`applied_by_user_id` text,
	`applied_at` integer,
	`payment_adjustment_status` text DEFAULT 'none' NOT NULL,
	`payment_adjustment_amount_cents` integer DEFAULT 0 NOT NULL,
	`payment_adjustment_reference` text,
	`metadata` text,
	`requested_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_booking_shift_request_booking_id_booking_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_shift_request_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_booking_shift_request_requested_by_user_id_user_id_fk` FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_booking_shift_request_customer_decision_by_user_id_user_id_fk` FOREIGN KEY (`customer_decision_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_booking_shift_request_manager_decision_by_user_id_user_id_fk` FOREIGN KEY (`manager_decision_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_booking_shift_request_rejected_by_user_id_user_id_fk` FOREIGN KEY (`rejected_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_booking_shift_request_applied_by_user_id_user_id_fk` FOREIGN KEY (`applied_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `notification_delivery` (
	`id` text PRIMARY KEY,
	`intent_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_recipient` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider_message_id` text,
	`failure_reason` text,
	`response_payload` text,
	`sent_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_notification_delivery_intent_id_notification_intent_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `notification_intent`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_notification_delivery_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `notification_event` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`actor_user_id` text,
	`event_type` text NOT NULL,
	`source_type` text,
	`source_id` text,
	`idempotency_key` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`processing_started_at` integer,
	`processed_at` integer,
	`failure_reason` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_notification_event_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_notification_event_actor_user_id_user_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `notification_in_app` (
	`id` text PRIMARY KEY,
	`event_id` text,
	`intent_id` text,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`cta_url` text,
	`severity` text DEFAULT 'info' NOT NULL,
	`metadata` text,
	`delivered_at` integer NOT NULL,
	`viewed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_notification_in_app_event_id_notification_event_id_fk` FOREIGN KEY (`event_id`) REFERENCES `notification_event`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_notification_in_app_intent_id_notification_intent_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `notification_intent`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_notification_in_app_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_notification_in_app_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `notification_intent` (
	`id` text PRIMARY KEY,
	`event_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`recipient_user_id` text,
	`channel` text NOT NULL,
	`template_key` text NOT NULL,
	`title` text,
	`body` text,
	`metadata` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`processed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_notification_intent_event_id_notification_event_id_fk` FOREIGN KEY (`event_id`) REFERENCES `notification_event`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_notification_intent_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_notification_intent_recipient_user_id_user_id_fk` FOREIGN KEY (`recipient_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `notification_preference` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`organization_id` text,
	`organization_scope_key` text DEFAULT 'global' NOT NULL,
	`event_type` text NOT NULL,
	`channel` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`quiet_hours_start` integer,
	`quiet_hours_end` integer,
	`timezone` text,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_notification_preference_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_notification_preference_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_notification_preference_created_by_user_id_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `inbound_message` (
	`id` text PRIMARY KEY,
	`organization_id` text,
	`ticket_id` text,
	`channel` text NOT NULL,
	`external_message_id` text NOT NULL,
	`external_thread_id` text,
	`external_sender_id` text,
	`sender_display_name` text,
	`dedupe_key` text NOT NULL,
	`normalized_text` text,
	`payload` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`error_message` text,
	`received_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`processed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_inbound_message_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_inbound_message_ticket_id_support_ticket_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `support_ticket`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `support_ticket` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`booking_id` text,
	`customer_user_id` text,
	`created_by_user_id` text,
	`assigned_to_user_id` text,
	`resolved_by_user_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`subject` text NOT NULL,
	`description` text,
	`due_at` integer,
	`resolved_at` integer,
	`closed_at` integer,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_support_ticket_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_support_ticket_booking_id_booking_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_support_ticket_customer_user_id_user_id_fk` FOREIGN KEY (`customer_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_support_ticket_created_by_user_id_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_support_ticket_assigned_to_user_id_user_id_fk` FOREIGN KEY (`assigned_to_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_support_ticket_resolved_by_user_id_user_id_fk` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `support_ticket_message` (
	`id` text PRIMARY KEY,
	`ticket_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`author_user_id` text,
	`channel` text DEFAULT 'internal' NOT NULL,
	`body` text NOT NULL,
	`attachments_json` text,
	`is_internal` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_support_ticket_message_ticket_id_support_ticket_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `support_ticket`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_support_ticket_message_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_support_ticket_message_author_user_id_user_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_notification` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`ticket_id` text,
	`requested_by_user_id` text,
	`template_key` text NOT NULL,
	`recipient_chat_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider_message_id` text,
	`failure_reason` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`sent_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_telegram_notification_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_telegram_notification_ticket_id_support_ticket_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `support_ticket`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_telegram_notification_requested_by_user_id_user_id_fk` FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_webhook_event` (
	`id` text PRIMARY KEY,
	`organization_id` text,
	`inbound_message_id` text,
	`update_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`chat_id` text,
	`payload` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`error_message` text,
	`received_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`processed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_telegram_webhook_event_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_telegram_webhook_event_inbound_message_id_inbound_message_id_fk` FOREIGN KEY (`inbound_message_id`) REFERENCES `inbound_message`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `todo` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`text` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_referral_code_unique` ON `affiliate_referral` (`code`);--> statement-breakpoint
CREATE INDEX `affiliate_referral_affiliateUserId_idx` ON `affiliate_referral` (`affiliate_user_id`);--> statement-breakpoint
CREATE INDEX `affiliate_referral_organizationId_idx` ON `affiliate_referral` (`organization_id`);--> statement-breakpoint
CREATE INDEX `affiliate_referral_status_idx` ON `affiliate_referral` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_affiliate_attribution_bookingId_unique` ON `booking_affiliate_attribution` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_affiliate_attribution_organizationId_idx` ON `booking_affiliate_attribution` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_affiliate_attribution_affiliateUserId_idx` ON `booking_affiliate_attribution` (`affiliate_user_id`);--> statement-breakpoint
CREATE INDEX `booking_affiliate_attribution_referralId_idx` ON `booking_affiliate_attribution` (`referral_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_affiliate_payout_attributionId_unique` ON `booking_affiliate_payout` (`attribution_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_affiliate_payout_bookingId_unique` ON `booking_affiliate_payout` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_affiliate_payout_organizationId_idx` ON `booking_affiliate_payout` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_affiliate_payout_affiliateUserId_idx` ON `booking_affiliate_payout` (`affiliate_user_id`);--> statement-breakpoint
CREATE INDEX `booking_affiliate_payout_status_idx` ON `booking_affiliate_payout` (`status`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE INDEX `invitation_status_idx` ON `invitation` (`status`);--> statement-breakpoint
CREATE INDEX `invitation_inviterId_idx` ON `invitation` (`inviter_id`);--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_org_user_unique` ON `member` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE INDEX `passkey_userId_idx` ON `passkey` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `passkey_credential_id_unique` ON `passkey` (`credential_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `boat_organizationId_idx` ON `boat` (`organization_id`);--> statement-breakpoint
CREATE INDEX `boat_status_idx` ON `boat` (`status`);--> statement-breakpoint
CREATE INDEX `boat_dockId_idx` ON `boat` (`dock_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_org_slug_unique` ON `boat` (`organization_id`,`slug`);--> statement-breakpoint
CREATE INDEX `boat_amenity_boatId_idx` ON `boat_amenity` (`boat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_amenity_boat_key_unique` ON `boat_amenity` (`boat_id`,`key`);--> statement-breakpoint
CREATE INDEX `boat_asset_boatId_idx` ON `boat_asset` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_asset_purpose_idx` ON `boat_asset` (`purpose`);--> statement-breakpoint
CREATE INDEX `boat_asset_uploadedByUserId_idx` ON `boat_asset` (`uploaded_by_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_asset_boat_storageKey_unique` ON `boat_asset` (`boat_id`,`storage_key`);--> statement-breakpoint
CREATE INDEX `boat_availability_block_boatId_idx` ON `boat_availability_block` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_availability_block_calendarConnectionId_idx` ON `boat_availability_block` (`calendar_connection_id`);--> statement-breakpoint
CREATE INDEX `boat_availability_block_source_idx` ON `boat_availability_block` (`source`);--> statement-breakpoint
CREATE INDEX `boat_availability_block_startsAt_idx` ON `boat_availability_block` (`starts_at`);--> statement-breakpoint
CREATE INDEX `boat_availability_block_endsAt_idx` ON `boat_availability_block` (`ends_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_availability_block_calendar_externalRef_unique` ON `boat_availability_block` (`calendar_connection_id`,`external_ref`);--> statement-breakpoint
CREATE INDEX `boat_availability_rule_boatId_idx` ON `boat_availability_rule` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_availability_rule_dayOfWeek_idx` ON `boat_availability_rule` (`day_of_week`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_availability_rule_unique` ON `boat_availability_rule` (`boat_id`,`day_of_week`,`start_minute`,`end_minute`);--> statement-breakpoint
CREATE INDEX `boat_calendar_connection_boatId_idx` ON `boat_calendar_connection` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_calendar_connection_provider_idx` ON `boat_calendar_connection` (`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_calendar_connection_boat_provider_external_unique` ON `boat_calendar_connection` (`boat_id`,`provider`,`external_calendar_id`);--> statement-breakpoint
CREATE INDEX `boat_dock_organizationId_idx` ON `boat_dock` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_dock_org_slug_unique` ON `boat_dock` (`organization_id`,`slug`);--> statement-breakpoint
CREATE INDEX `boat_minimum_duration_rule_boatId_idx` ON `boat_minimum_duration_rule` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_minimum_duration_rule_isActive_idx` ON `boat_minimum_duration_rule` (`is_active`);--> statement-breakpoint
CREATE INDEX `boat_pricing_profile_boatId_idx` ON `boat_pricing_profile` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_pricing_profile_isDefault_idx` ON `boat_pricing_profile` (`is_default`);--> statement-breakpoint
CREATE INDEX `boat_pricing_profile_validFrom_idx` ON `boat_pricing_profile` (`valid_from`);--> statement-breakpoint
CREATE INDEX `boat_pricing_rule_boatId_idx` ON `boat_pricing_rule` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_pricing_rule_pricingProfileId_idx` ON `boat_pricing_rule` (`pricing_profile_id`);--> statement-breakpoint
CREATE INDEX `boat_pricing_rule_priority_idx` ON `boat_pricing_rule` (`priority`);--> statement-breakpoint
CREATE INDEX `calendar_webhook_event_provider_channel_idx` ON `calendar_webhook_event` (`provider`,`channel_id`);--> statement-breakpoint
CREATE INDEX `calendar_webhook_event_status_idx` ON `calendar_webhook_event` (`status`);--> statement-breakpoint
CREATE INDEX `calendar_webhook_event_connectionId_idx` ON `calendar_webhook_event` (`calendar_connection_id`);--> statement-breakpoint
CREATE INDEX `calendar_webhook_event_receivedAt_idx` ON `calendar_webhook_event` (`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_webhook_event_provider_channel_message_unique` ON `calendar_webhook_event` (`provider`,`channel_id`,`message_number`);--> statement-breakpoint
CREATE INDEX `booking_organizationId_idx` ON `booking` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_boatId_idx` ON `booking` (`boat_id`);--> statement-breakpoint
CREATE INDEX `booking_status_idx` ON `booking` (`status`);--> statement-breakpoint
CREATE INDEX `booking_paymentStatus_idx` ON `booking` (`payment_status`);--> statement-breakpoint
CREATE INDEX `booking_startsAt_idx` ON `booking` (`starts_at`);--> statement-breakpoint
CREATE INDEX `booking_endsAt_idx` ON `booking` (`ends_at`);--> statement-breakpoint
CREATE INDEX `booking_customerUserId_idx` ON `booking` (`customer_user_id`);--> statement-breakpoint
CREATE INDEX `booking_calendarSyncStatus_idx` ON `booking` (`calendar_sync_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_org_source_externalRef_unique` ON `booking` (`organization_id`,`source`,`external_ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_calendar_link_bookingId_unique` ON `booking_calendar_link` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_calendar_link_connectionId_idx` ON `booking_calendar_link` (`boat_calendar_connection_id`);--> statement-breakpoint
CREATE INDEX `booking_calendar_link_provider_idx` ON `booking_calendar_link` (`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_calendar_link_provider_calendar_event_unique` ON `booking_calendar_link` (`provider`,`external_calendar_id`,`external_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_cancellation_request_bookingId_unique` ON `booking_cancellation_request` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_cancellation_request_organizationId_idx` ON `booking_cancellation_request` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_cancellation_request_status_idx` ON `booking_cancellation_request` (`status`);--> statement-breakpoint
CREATE INDEX `booking_cancellation_request_requestedByUserId_idx` ON `booking_cancellation_request` (`requested_by_user_id`);--> statement-breakpoint
CREATE INDEX `booking_discount_application_discountCodeId_idx` ON `booking_discount_application` (`discount_code_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_discount_application_bookingId_unique` ON `booking_discount_application` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_discount_code_organizationId_idx` ON `booking_discount_code` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_discount_code_isActive_idx` ON `booking_discount_code` (`is_active`);--> statement-breakpoint
CREATE INDEX `booking_discount_code_validFrom_idx` ON `booking_discount_code` (`valid_from`);--> statement-breakpoint
CREATE INDEX `booking_discount_code_validTo_idx` ON `booking_discount_code` (`valid_to`);--> statement-breakpoint
CREATE INDEX `booking_discount_code_appliesToBoatId_idx` ON `booking_discount_code` (`applies_to_boat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_discount_code_org_code_unique` ON `booking_discount_code` (`organization_id`,`code`);--> statement-breakpoint
CREATE INDEX `booking_dispute_bookingId_idx` ON `booking_dispute` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_dispute_organizationId_idx` ON `booking_dispute` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_dispute_status_idx` ON `booking_dispute` (`status`);--> statement-breakpoint
CREATE INDEX `booking_dispute_raisedByUserId_idx` ON `booking_dispute` (`raised_by_user_id`);--> statement-breakpoint
CREATE INDEX `booking_payment_attempt_bookingId_idx` ON `booking_payment_attempt` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_payment_attempt_organizationId_idx` ON `booking_payment_attempt` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_payment_attempt_status_idx` ON `booking_payment_attempt` (`status`);--> statement-breakpoint
CREATE INDEX `booking_payment_attempt_provider_idx` ON `booking_payment_attempt` (`provider`);--> statement-breakpoint
CREATE INDEX `booking_payment_attempt_requestedByUserId_idx` ON `booking_payment_attempt` (`requested_by_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_payment_attempt_booking_idempotency_unique` ON `booking_payment_attempt` (`booking_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_payment_attempt_provider_intent_unique` ON `booking_payment_attempt` (`provider`,`provider_intent_id`);--> statement-breakpoint
CREATE INDEX `booking_refund_bookingId_idx` ON `booking_refund` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_refund_organizationId_idx` ON `booking_refund` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_refund_status_idx` ON `booking_refund` (`status`);--> statement-breakpoint
CREATE INDEX `booking_refund_requestedByUserId_idx` ON `booking_refund` (`requested_by_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_refund_provider_externalRefundId_unique` ON `booking_refund` (`provider`,`external_refund_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_shift_request_bookingId_unique` ON `booking_shift_request` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_shift_request_organizationId_idx` ON `booking_shift_request` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_shift_request_status_idx` ON `booking_shift_request` (`status`);--> statement-breakpoint
CREATE INDEX `booking_shift_request_requestedByUserId_idx` ON `booking_shift_request` (`requested_by_user_id`);--> statement-breakpoint
CREATE INDEX `notification_delivery_intentId_idx` ON `notification_delivery` (`intent_id`);--> statement-breakpoint
CREATE INDEX `notification_delivery_organizationId_idx` ON `notification_delivery` (`organization_id`);--> statement-breakpoint
CREATE INDEX `notification_delivery_provider_idx` ON `notification_delivery` (`provider`);--> statement-breakpoint
CREATE INDEX `notification_delivery_status_idx` ON `notification_delivery` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_delivery_intent_attempt_unique` ON `notification_delivery` (`intent_id`,`attempt`);--> statement-breakpoint
CREATE INDEX `notification_event_organizationId_idx` ON `notification_event` (`organization_id`);--> statement-breakpoint
CREATE INDEX `notification_event_eventType_idx` ON `notification_event` (`event_type`);--> statement-breakpoint
CREATE INDEX `notification_event_status_idx` ON `notification_event` (`status`);--> statement-breakpoint
CREATE INDEX `notification_event_createdAt_idx` ON `notification_event` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_event_org_idempotency_unique` ON `notification_event` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `notification_in_app_eventId_idx` ON `notification_in_app` (`event_id`);--> statement-breakpoint
CREATE INDEX `notification_in_app_intentId_idx` ON `notification_in_app` (`intent_id`);--> statement-breakpoint
CREATE INDEX `notification_in_app_organizationId_idx` ON `notification_in_app` (`organization_id`);--> statement-breakpoint
CREATE INDEX `notification_in_app_userId_idx` ON `notification_in_app` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_in_app_viewedAt_idx` ON `notification_in_app` (`viewed_at`);--> statement-breakpoint
CREATE INDEX `notification_in_app_deliveredAt_idx` ON `notification_in_app` (`delivered_at`);--> statement-breakpoint
CREATE INDEX `notification_intent_eventId_idx` ON `notification_intent` (`event_id`);--> statement-breakpoint
CREATE INDEX `notification_intent_organizationId_idx` ON `notification_intent` (`organization_id`);--> statement-breakpoint
CREATE INDEX `notification_intent_recipientUserId_idx` ON `notification_intent` (`recipient_user_id`);--> statement-breakpoint
CREATE INDEX `notification_intent_channel_idx` ON `notification_intent` (`channel`);--> statement-breakpoint
CREATE INDEX `notification_intent_status_idx` ON `notification_intent` (`status`);--> statement-breakpoint
CREATE INDEX `notification_preference_userId_idx` ON `notification_preference` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_preference_organizationId_idx` ON `notification_preference` (`organization_id`);--> statement-breakpoint
CREATE INDEX `notification_preference_eventType_idx` ON `notification_preference` (`event_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_preference_scope_unique` ON `notification_preference` (`user_id`,`organization_scope_key`,`event_type`,`channel`);--> statement-breakpoint
CREATE INDEX `inbound_message_organizationId_idx` ON `inbound_message` (`organization_id`);--> statement-breakpoint
CREATE INDEX `inbound_message_ticketId_idx` ON `inbound_message` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `inbound_message_channel_idx` ON `inbound_message` (`channel`);--> statement-breakpoint
CREATE INDEX `inbound_message_status_idx` ON `inbound_message` (`status`);--> statement-breakpoint
CREATE INDEX `inbound_message_receivedAt_idx` ON `inbound_message` (`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_message_channel_dedupe_unique` ON `inbound_message` (`channel`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `support_ticket_organizationId_idx` ON `support_ticket` (`organization_id`);--> statement-breakpoint
CREATE INDEX `support_ticket_status_idx` ON `support_ticket` (`status`);--> statement-breakpoint
CREATE INDEX `support_ticket_priority_idx` ON `support_ticket` (`priority`);--> statement-breakpoint
CREATE INDEX `support_ticket_assignedToUserId_idx` ON `support_ticket` (`assigned_to_user_id`);--> statement-breakpoint
CREATE INDEX `support_ticket_dueAt_idx` ON `support_ticket` (`due_at`);--> statement-breakpoint
CREATE INDEX `support_ticket_bookingId_idx` ON `support_ticket` (`booking_id`);--> statement-breakpoint
CREATE INDEX `support_ticket_message_ticketId_idx` ON `support_ticket_message` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `support_ticket_message_organizationId_idx` ON `support_ticket_message` (`organization_id`);--> statement-breakpoint
CREATE INDEX `support_ticket_message_channel_idx` ON `support_ticket_message` (`channel`);--> statement-breakpoint
CREATE INDEX `support_ticket_message_createdAt_idx` ON `support_ticket_message` (`created_at`);--> statement-breakpoint
CREATE INDEX `telegram_notification_organizationId_idx` ON `telegram_notification` (`organization_id`);--> statement-breakpoint
CREATE INDEX `telegram_notification_ticketId_idx` ON `telegram_notification` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `telegram_notification_status_idx` ON `telegram_notification` (`status`);--> statement-breakpoint
CREATE INDEX `telegram_notification_recipientChatId_idx` ON `telegram_notification` (`recipient_chat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_notification_org_idempotency_unique` ON `telegram_notification` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `telegram_webhook_event_organizationId_idx` ON `telegram_webhook_event` (`organization_id`);--> statement-breakpoint
CREATE INDEX `telegram_webhook_event_inboundMessageId_idx` ON `telegram_webhook_event` (`inbound_message_id`);--> statement-breakpoint
CREATE INDEX `telegram_webhook_event_status_idx` ON `telegram_webhook_event` (`status`);--> statement-breakpoint
CREATE INDEX `telegram_webhook_event_chatId_idx` ON `telegram_webhook_event` (`chat_id`);--> statement-breakpoint
CREATE INDEX `telegram_webhook_event_receivedAt_idx` ON `telegram_webhook_event` (`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_webhook_event_updateId_unique` ON `telegram_webhook_event` (`update_id`);
