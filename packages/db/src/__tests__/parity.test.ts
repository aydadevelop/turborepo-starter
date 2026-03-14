/**
 * Canary parity test for Phase 1 schema baseline.
 *
 * Validates that the parity harness works and that the current schema
 * matches the known-good Phase 1 table inventory. When adding new tables,
 * update PHASE_1_BASELINE_TABLES and document the delta in a comment.
 */
import { isTable } from "drizzle-orm";
import { describe, it } from "vitest";
// biome-ignore lint/performance/noNamespaceImport: schema parity enumerates all schema exports dynamically.
import * as schema from "../schema";
import { createParityTest } from "../test";

/**
 * Known-good table names from the Phase 1 snapshot.
 * Update this list when adding or removing tables — the act of updating
 * documents the schema delta and keeps parity verified.
 */
const PHASE_1_BASELINE_TABLES = [
	"account",
	"affiliateReferral",
	"assistantChat",
	"assistantMessage",
	"booking",
	"bookingAffiliateAttribution",
	"bookingAffiliatePayout",
	"bookingCalendarLink",
	"bookingCancellationRequest",
	"bookingDiscountApplication",
	"bookingDiscountCode",
	"bookingDispute",
	"bookingPaymentAttempt",
	"bookingRefund",
	"bookingShiftRequest",
	"bookingStaffAssignment",
	"calendarWebhookEvent",
	"cancellationPolicy",
	"inboundMessage",
	"invitation",
	"listing",
	"listingAmenity",
	"listingAsset",
	"listingAvailabilityBlock",
	"listingAvailabilityException",
	"listingAvailabilityRule",
	// Added in 03-12: typed boat-rent family profile state
	"listingBoatRentProfile",
	// Added in 03-12: typed excursions family profile state
	"listingExcursionProfile",
	"listingCalendarConnection",
	"listingLocation",
	"listingMinimumDurationRule",
	// Added in 03-12: persistent moderation audit trail for listing approvals
	"listingModerationAudit",
	"listingPricingProfile",
	"listingPricingRule",
	"listingPublication",
	"listingReview",
	"listingReviewResponse",
	"listingStaffAssignment",
	"listingTypeConfig",
	"member",
	"notificationDelivery",
	"notificationEvent",
	"notificationInApp",
	"notificationIntent",
	"notificationPreference",
	"organization",
	"organizationCalendarAccount",
	"organizationCalendarSource",
	"organizationListingType",
	"organizationManualOverride",
	"organizationOnboarding",
	"organizationPaymentConfig",
	"organizationSettings",
	"passkey",
	"paymentProviderConfig",
	"paymentWebhookEvent",
	"platformFeeConfig",
	"session",
	"supportTicket",
	"supportTicketMessage",
	"todo",
	"user",
	"userConsent",
	"verification",
	// Added in 02-02: workflow execution log tables
	"workflowExecution",
	"workflowStepLog",
].sort();

/**
 * Enumerate Drizzle table export names from the current schema.
 * Uses isTable() from drizzle-orm to identify table objects.
 */
const getExportedTableNames = (): string[] => {
	const names: string[] = [];
	for (const [exportName, value] of Object.entries(schema)) {
		if (isTable(value)) {
			names.push(exportName);
		}
	}
	return names.sort();
};

describe("Schema parity: Phase 1 baseline", () => {
	it(
		"parity: exported schema tables match Phase 1 baseline",
		createParityTest({
			domain: "db.schema",
			description: "schema table exports match Phase 1 hardcoded baseline",
			inputs: [null as null],
			legacyFn: (_input) => PHASE_1_BASELINE_TABLES,
			extractedFn: (_input) => getExportedTableNames(),
		})
	);
});
