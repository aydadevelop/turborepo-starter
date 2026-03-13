/**
 * FK-ordered table list for namespace-based cleanup.
 * Children first, parents last — respects foreign key constraints.
 *
 * Shared between seed-local.mjs (clear seed namespace) and
 * e2e-web db-client.ts (test namespace cleanup).
 */
export const CLEANUP_TABLES = [
	// marketplace (children first, parents last)
	"booking_discount_application",
	"booking_cancellation_request",
	"booking",
	"booking_discount_code",
	"listing_availability_block",
	"listing_availability_exception",
	"listing_availability_rule",
	"listing_minimum_duration_rule",
	"listing_calendar_connection",
	"organization_calendar_source",
	"organization_calendar_account",
	"listing_publication",
	"listing_moderation_audit",
	"organization_manual_override",
	"cancellation_policy",
	"listing_pricing_rule",
	"listing_pricing_profile",
	"listing_asset",
	"listing_amenity",
	"listing",
	"listing_location",
	"organization_onboarding",
	"organization_listing_type",
	"organization_payment_config",
	"organization_settings",
	"payment_provider_config",
	"listing_type_config",
	// auth + app tables
	"assistant_message",
	"assistant_chat",
	"notification_in_app",
	"notification_delivery",
	"notification_intent",
	"notification_event",
	"notification_preference",
	"user_consent",
	"passkey",
	"verification",
	"invitation",
	"member",
	"account",
	"session",
	"organization",
];
