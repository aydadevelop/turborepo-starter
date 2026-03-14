import type { db } from "@my-app/db";
import type {
	listingModerationAudit,
	organizationManualOverride,
	organizationOnboarding,
} from "@my-app/db/schema/marketplace";

export type Db = typeof db;
export type OrganizationOnboardingRow =
	typeof organizationOnboarding.$inferSelect;
export type OrganizationManualOverrideRow =
	typeof organizationManualOverride.$inferSelect;
export type OrganizationListingModerationAuditRow =
	typeof listingModerationAudit.$inferSelect;

export interface OrganizationPublishingSummary {
	activePublicationCount: number;
	draftListingCount: number;
	publishedListingCount: number;
	reviewPendingCount: number;
	totalListingCount: number;
	unpublishedListingCount: number;
}

export interface OrganizationModerationSummary {
	approvedListingCount: number;
	reviewPendingCount: number;
	unapprovedActiveListingCount: number;
}

export interface OrganizationDistributionSummary {
	listingsWithoutPublicationCount: number;
	marketplacePublicationCount: number;
	ownSitePublicationCount: number;
}

export interface OrganizationBlockerSummary {
	missingCalendarCount: number;
	missingLocationCount: number;
	missingPricingCount: number;
	missingPrimaryImageCount: number;
	totalBlockingIssues: number;
}

export interface OrganizationManualOverrideSummary {
	activeCount: number;
	items: OrganizationManualOverrideRow[];
}

export type OrganizationPublicationChannelType =
	| "own_site"
	| "platform_marketplace";

export interface OrganizationListingModerationState {
	approvedAt: Date | null;
	isApproved: boolean;
	listingId: string;
}

export interface OrganizationListingModerationAuditEntry {
	actedAt: Date;
	actedByDisplayName: string | null;
	actedByUserId: string | null;
	action: OrganizationListingModerationAuditRow["action"];
	id: string;
	listingId: string;
	note: string | null;
	organizationId: string;
}

export interface OrganizationListingDistributionState {
	activeChannels: OrganizationPublicationChannelType[];
	activePublicationCount: number;
	isPublished: boolean;
	listingId: string;
}

export interface OrganizationOverlaySummary {
	blockers: OrganizationBlockerSummary;
	distribution: OrganizationDistributionSummary;
	manualOverrides: OrganizationManualOverrideSummary;
	moderation: OrganizationModerationSummary;
	onboarding: OrganizationOnboardingRow;
	publishing: OrganizationPublishingSummary;
}

export const organizationOverlayEventTypes = [
	"payment:organization-config-readiness-changed",
	"calendar:organization-connection-readiness-changed",
	"listing:organization-publication-readiness-changed",
] as const;

export type OrganizationOverlayEventType =
	(typeof organizationOverlayEventTypes)[number];
