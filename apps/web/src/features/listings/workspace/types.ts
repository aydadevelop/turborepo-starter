import type {
	AvailabilityWorkspaceState,
	CalendarWorkspaceState,
	ListingAssetWorkspaceState,
	ListingModerationAuditEntry,
	ListingTypeOption,
	ListingWorkspaceState,
	OrpcInputs,
	PricingWorkspaceState,
} from "$lib/orpc-types";

export interface ListingWorkspaceCalendarActions {
	attachingSourceId?: string | null;
	calendarActionErrorMessage?: string | null;
	calendarNoticeMessage?: string | null;
	calendarNoticeTone?: "error" | "success";
	googleCalendarConnectUrl?: string | null;
	onAttachCalendarSource?: ((sourceId: string) => void | Promise<void>) | null;
	onDetachConnection?: ((connectionId: string) => void | Promise<void>) | null;
	onRefreshCalendarAccountSources?:
		| ((accountId: string) => void | Promise<void>)
		| null;
	refreshingAccountId?: string | null;
}

export interface ListingWorkspaceBasicsActions {
	initialValue?: ListingWorkspaceInitialValue | null;
	listingTypeOptions?: ListingTypeOption[];
	onUpdateListing?:
		| ((
				input: OrpcInputs["listing"]["create"],
		  ) => boolean | undefined | Promise<boolean | undefined>)
		| null;
	updateErrorMessage?: string | null;
	updatePending?: boolean;
}

export interface ListingWorkspacePublishActions {
	distributionErrorMessage?: string | null;
	distributionSubmitPending?: boolean;
	moderationActionErrorMessage?: string | null;
	moderationSubmitPending?: boolean;
	onApproveListing?:
		| ((input: {
				listingId: string;
				note?: string;
		  }) => boolean | undefined | Promise<boolean | undefined>)
		| null;
	onClearListingApproval?:
		| ((input: {
				listingId: string;
				note?: string;
		  }) => boolean | undefined | Promise<boolean | undefined>)
		| null;
	onPublishListingToChannel?:
		| ((input: {
				channelType: "own_site" | "platform_marketplace";
				listingId: string;
		  }) => boolean | undefined | Promise<boolean | undefined>)
		| null;
	onUnpublishListing?:
		| ((
				listingId: string,
		  ) => boolean | undefined | Promise<boolean | undefined>)
		| null;
}

export interface ListingWorkspacePricingActions {
	onCreatePricingProfile?:
		| ((input: {
				baseHourlyPriceCents: number;
				currency: string;
				isDefault?: boolean;
				listingId: string;
				minimumHours?: number;
				name: string;
				serviceFeeBps?: number;
				taxBps?: number;
		  }) => boolean | undefined | Promise<boolean | undefined>)
		| null;
	onCreatePricingRule?:
		| ((input: {
				adjustmentType: "flat_cents" | "percent";
				adjustmentValue: number;
				conditionJson: Record<string, unknown>;
				listingId: string;
				name: string;
				priority?: number;
				pricingProfileId: string;
				ruleType: string;
		  }) => boolean | undefined | Promise<boolean | undefined>)
		| null;
	pricingActionErrorMessage?: string | null;
	pricingRuleActionErrorMessage?: string | null;
	pricingRuleSubmitPending?: boolean;
	pricingSubmitPending?: boolean;
}

export interface ListingWorkspaceAvailabilityActions {
	availabilityActionErrorMessage?: string | null;
	availabilityBlockActionErrorMessage?: string | null;
	availabilityBlockSubmitPending?: boolean;
	availabilityExceptionActionErrorMessage?: string | null;
	availabilityExceptionSubmitPending?: boolean;
	availabilitySubmitPending?: boolean;
	onAddAvailabilityBlock?:
		| ((input: {
				endsAt: string;
				listingId: string;
				reason?: string;
				startsAt: string;
		  }) => boolean | undefined | Promise<boolean | undefined>)
		| null;
	onAddAvailabilityException?:
		| ((input: {
				date: string;
				endMinute?: number;
				isAvailable: boolean;
				listingId: string;
				reason?: string;
				startMinute?: number;
		  }) => boolean | undefined | Promise<boolean | undefined>)
		| null;
	onAddAvailabilityRule?:
		| ((input: {
				dayOfWeek: number;
				endMinute: number;
				listingId: string;
				startMinute: number;
		  }) => boolean | undefined | Promise<boolean | undefined>)
		| null;
}

export interface ListingWorkspaceSectionsProps
	extends
		ListingWorkspaceBasicsActions,
		ListingWorkspaceCalendarActions,
		ListingWorkspacePricingActions,
		ListingWorkspaceAvailabilityActions,
		ListingWorkspacePublishActions {
	assets?: ListingAssetWorkspaceState | null;
	availability?: AvailabilityWorkspaceState | null;
	calendar?: CalendarWorkspaceState | null;
	moderationAudit?: ListingModerationAuditEntry[] | null;
	pricing?: PricingWorkspaceState | null;
	workspace: ListingWorkspaceState;
}

export interface ListingWorkspaceInitialServiceFamilyDetails {
	boatRent?: ListingWorkspaceState["boatRentProfile"];
	excursion?: ListingWorkspaceState["excursionProfile"];
}

export interface ListingWorkspaceInitialValue {
	description: ListingWorkspaceState["listing"]["description"];
	listingTypeSlug: ListingWorkspaceState["listing"]["listingTypeSlug"];
	metadata: ListingWorkspaceState["listing"]["metadata"];
	name: ListingWorkspaceState["listing"]["name"];
	serviceFamilyDetails?: ListingWorkspaceInitialServiceFamilyDetails;
	slug: ListingWorkspaceState["listing"]["slug"];
	timezone: ListingWorkspaceState["listing"]["timezone"];
}
