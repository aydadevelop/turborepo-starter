import type { OrganizationOverlaySummary } from "$lib/orpc-types";

export interface OrganizationOverlayListingOption {
	id: string;
	name: string;
}

export interface ManualOverrideInput {
	code: string;
	note?: string;
	scopeKey?: string | null;
	scopeType: "organization" | "listing";
	title: string;
}

export interface DistributionActionInput {
	channelType: "own_site" | "platform_marketplace";
	listingId: string;
}

export interface OrganizationOverlayActions {
	onApproveListing: (input: {
		listingId: string;
		note?: string;
	}) => boolean | undefined | Promise<boolean | undefined>;
	onClearListingApproval: (input: {
		listingId: string;
		note?: string;
	}) => boolean | undefined | Promise<boolean | undefined>;
	onCreateManualOverride: (
		input: ManualOverrideInput,
	) => boolean | undefined | Promise<boolean | undefined>;
	onPublishListingToChannel: (
		input: DistributionActionInput,
	) => boolean | undefined | Promise<boolean | undefined>;
	onResolveManualOverride: (
		id: string,
	) => boolean | undefined | Promise<boolean | undefined>;
	onUnpublishListing: (
		listingId: string,
	) => boolean | undefined | Promise<boolean | undefined>;
}

export type OrganizationOverlayPanelProps = OrganizationOverlayActions & {
	createError?: string | null;
	createPending?: boolean;
	distributionError?: string | null;
	distributionPending?: boolean;
	listingOptions?: OrganizationOverlayListingOption[];
	moderationError?: string | null;
	moderationPending?: boolean;
	overlay: OrganizationOverlaySummary;
	resolvePendingId?: string | null;
};
