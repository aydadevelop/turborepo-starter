import type {
	ListingListItem,
	OrganizationOverlaySummary,
} from "$lib/orpc-types";

export interface OrganizationListingOption {
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

export interface OrganizationListingsScreenData {
	listingOptions: OrganizationListingOption[];
	listings: ListingListItem[];
	overlay: OrganizationOverlaySummary | null;
	total: number;
}
