import type { InferClientInputs, InferClientOutputs } from "@orpc/client";

import type { client } from "./orpc";

export type OrpcInputs = InferClientInputs<typeof client>;
export type OrpcOutputs = InferClientOutputs<typeof client>;

export type ListingOutput = OrpcOutputs["listing"]["get"];
export type ListingListItem = OrpcOutputs["listing"]["list"]["items"][number];
export type ListingTypeOption =
	OrpcOutputs["listing"]["listAvailableTypes"]["items"][number];
export type ListingCreateEditorState =
	OrpcOutputs["listing"]["getCreateEditorState"];
export type ListingWorkspaceState = OrpcOutputs["listing"]["getWorkspaceState"];
export type ListingBoatRentProfileState = NonNullable<
	ListingWorkspaceState["boatRentProfile"]
>;
export type ListingExcursionProfileState = NonNullable<
	ListingWorkspaceState["excursionProfile"]
>;
export type ListingAssetWorkspaceState =
	OrpcOutputs["listing"]["getAssetWorkspaceState"];
export type PricingWorkspaceState = OrpcOutputs["pricing"]["getWorkspaceState"];
export type AvailabilityWorkspaceState =
	OrpcOutputs["availability"]["getWorkspaceState"];
export type CalendarWorkspaceState =
	OrpcOutputs["calendar"]["getWorkspaceState"];
export type CalendarOrgWorkspaceState =
	OrpcOutputs["calendar"]["getOrgWorkspaceState"];
export type CalendarSource =
	CalendarWorkspaceState["sources"][number];

export type NotificationListOutput = OrpcOutputs["notifications"]["listMe"];
export type InAppNotificationItem = NotificationListOutput["items"][number];

export type OrganizationOverlaySummary =
	OrpcOutputs["organization"]["getOverlaySummary"];
export type ListingModerationAuditEntry =
	OrpcOutputs["organization"]["getListingModerationAudit"][number];
export type SupportOperatorSummary =
	OrpcOutputs["support"]["getOperatorSummary"];
export type StorefrontListingItem = OrpcOutputs["storefront"]["get"];
export type StorefrontBookingSurfaceInput =
	OrpcInputs["storefront"]["getBookingSurface"];
export type StorefrontBookingSurface =
	OrpcOutputs["storefront"]["getBookingSurface"];
export type StorefrontBookingSurfaceSlot =
	StorefrontBookingSurface["slots"][number];
export type StorefrontBookingSlotQuote = NonNullable<
	StorefrontBookingSurfaceSlot["quote"]
>;
export type BookingCreateInput = OrpcInputs["booking"]["create"];
