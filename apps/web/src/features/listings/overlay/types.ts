import type { OrganizationOverlaySummary } from "$lib/orpc-types";

export type OrganizationOverlayListingOption = {
	id: string;
	name: string;
};

export type ManualOverrideInput = {
	scopeType: "organization" | "listing";
	scopeKey?: string | null;
	code: string;
	title: string;
	note?: string;
};

export type DistributionActionInput = {
	listingId: string;
	channelType: "own_site" | "platform_marketplace";
};

export type OrganizationOverlayActions = {
	onApproveListing: (input: {
		listingId: string;
		note?: string;
	}) => boolean | void | Promise<boolean | void>;
	onClearListingApproval: (input: {
		listingId: string;
		note?: string;
	}) => boolean | void | Promise<boolean | void>;
	onCreateManualOverride: (
		input: ManualOverrideInput
	) => boolean | void | Promise<boolean | void>;
	onPublishListingToChannel: (
		input: DistributionActionInput
	) => boolean | void | Promise<boolean | void>;
	onResolveManualOverride: (id: string) => boolean | void | Promise<boolean | void>;
	onUnpublishListing: (
		listingId: string
	) => boolean | void | Promise<boolean | void>;
};

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
