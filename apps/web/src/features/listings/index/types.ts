import type {
	ListingListItem,
	OrganizationOverlaySummary,
} from "$lib/orpc-types";

export type OrganizationListingOption = {
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

export type OrganizationListingsScreenData = {
	listingOptions: OrganizationListingOption[];
	listings: ListingListItem[];
	overlay: OrganizationOverlaySummary | null;
	total: number;
};
