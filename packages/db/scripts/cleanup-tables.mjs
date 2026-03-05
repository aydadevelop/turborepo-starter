/**
 * FK-ordered table list for namespace-based cleanup.
 * Children first, parents last — respects foreign key constraints.
 *
 * Shared between seed-local.mjs (clear seed namespace) and
 * e2e-web db-client.ts (test namespace cleanup).
 */
export const CLEANUP_TABLES = [
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
