import { goto } from "$app/navigation";
import {
	createMutation,
	createQuery,
	skipToken,
} from "@tanstack/svelte-query";

import { orpc, queryClient } from "$lib/orpc";
import { resolveServerPath } from "$lib/server-url";
import type {
	ListingWorkspaceState,
} from "$lib/orpc-types";

import type {
	ListingWorkspaceInitialServiceFamilyDetails,
	ListingWorkspaceInitialValue,
} from "./types";

const getListingWorkspaceInput = (
	value: string
): { id: string } | typeof skipToken => (value ? { id: value } : skipToken);

const getListingScopedInput = (
	value: string
): { listingId: string } | typeof skipToken =>
	value ? { listingId: value } : skipToken;

export const createListingWorkspaceQueries = (getListingId: () => string) => ({
	workspaceStateQuery: createQuery(() =>
		orpc.listing.getWorkspaceState.queryOptions({
			input: getListingWorkspaceInput(getListingId()),
		})
	),
	assetWorkspaceQuery: createQuery(() =>
		orpc.listing.getAssetWorkspaceState.queryOptions({
			input: getListingWorkspaceInput(getListingId()),
		})
	),
	pricingWorkspaceQuery: createQuery(() =>
		orpc.pricing.getWorkspaceState.queryOptions({
			input: getListingScopedInput(getListingId()),
		})
	),
	availabilityWorkspaceQuery: createQuery(() =>
		orpc.availability.getWorkspaceState.queryOptions({
			input: getListingScopedInput(getListingId()),
		})
	),
	calendarWorkspaceQuery: createQuery(() =>
		orpc.calendar.getWorkspaceState.queryOptions({
			input: getListingScopedInput(getListingId()),
		})
	),
	moderationAuditQuery: createQuery(() =>
		orpc.organization.getListingModerationAudit.queryOptions({
			input: getListingScopedInput(getListingId()),
		})
	),
});

export const createListingWorkspaceMutations = (getListingId: () => string) => ({
	updateListingMutation: createMutation(() =>
		orpc.listing.update.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.listing.key() });
				await goto("/org/listings");
			},
		})
	),
	createPricingProfileMutation: createMutation(() =>
		orpc.pricing.createProfile.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.pricing.getWorkspaceState.queryKey({
						input: { listingId: getListingId() },
					}),
				});
			},
		})
	),
	addPricingRuleMutation: createMutation(() =>
		orpc.pricing.addRule.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.pricing.getWorkspaceState.queryKey({
						input: { listingId: getListingId() },
					}),
				});
			},
		})
	),
	addAvailabilityRuleMutation: createMutation(() =>
		orpc.availability.addRule.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.availability.getWorkspaceState.queryKey({
						input: { listingId: getListingId() },
					}),
				});
			},
		})
	),
	addAvailabilityBlockMutation: createMutation(() =>
		orpc.availability.addBlock.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.availability.getWorkspaceState.queryKey({
						input: { listingId: getListingId() },
					}),
				});
			},
		})
	),
	addAvailabilityExceptionMutation: createMutation(() =>
		orpc.availability.addException.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.availability.getWorkspaceState.queryKey({
						input: { listingId: getListingId() },
					}),
				});
			},
		})
	),
	refreshCalendarSourcesMutation: createMutation(() =>
		orpc.calendar.refreshAccountSources.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.calendar.key() });
			},
		})
	),
	attachCalendarSourceMutation: createMutation(() =>
		orpc.calendar.attachSource.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.calendar.key() });
			},
		})
	),
	approveListingMutation: createMutation(() =>
		orpc.organization.approveListing.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: orpc.organization.key() }),
					queryClient.invalidateQueries({ queryKey: orpc.listing.key() }),
				]);
			},
		})
	),
	clearListingApprovalMutation: createMutation(() =>
		orpc.organization.clearListingApproval.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: orpc.organization.key() }),
					queryClient.invalidateQueries({ queryKey: orpc.listing.key() }),
				]);
			},
		})
	),
	publishListingToChannelMutation: createMutation(() =>
		orpc.organization.publishListingToChannel.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: orpc.organization.key() }),
					queryClient.invalidateQueries({ queryKey: orpc.listing.key() }),
				]);
			},
		})
	),
	unpublishListingMutation: createMutation(() =>
		orpc.organization.unpublishListing.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: orpc.organization.key() }),
					queryClient.invalidateQueries({ queryKey: orpc.listing.key() }),
				]);
			},
		})
	),
});

export const buildInitialServiceFamilyDetails = (
	workspaceState: ListingWorkspaceState | undefined
): ListingWorkspaceInitialServiceFamilyDetails | undefined => {
	if (!workspaceState) {
		return undefined;
	}

	if (workspaceState.boatRentProfile) {
		return {
			boatRent: workspaceState.boatRentProfile,
		};
	}

	if (workspaceState.excursionProfile) {
		return {
			excursion: workspaceState.excursionProfile,
		};
	}

	return undefined;
};

export const buildListingWorkspaceInitialValue = (
	workspaceState: ListingWorkspaceState | undefined
): ListingWorkspaceInitialValue | undefined => {
	if (!workspaceState) {
		return undefined;
	}

	return {
		listingTypeSlug: workspaceState.listing.listingTypeSlug,
		name: workspaceState.listing.name,
		slug: workspaceState.listing.slug,
		timezone: workspaceState.listing.timezone,
		description: workspaceState.listing.description,
		metadata: workspaceState.listing.metadata,
		serviceFamilyDetails: buildInitialServiceFamilyDetails(workspaceState),
	};
};

export const getGoogleCalendarConnectUrl = (): string =>
	resolveServerPath("/api/calendar/oauth/google/start");

export const buildCalendarWorkspaceNotice = (
	searchParams: URLSearchParams
): {
	calendarNoticeMessage: string | null;
	calendarNoticeTone: "error" | "success";
} => {
	const calendarConnectStatus = searchParams.get("calendarConnect");
	const calendarSyncStatus = searchParams.get("calendarSync");

	if (calendarConnectStatus === "connected" && calendarSyncStatus === "error") {
		return {
			calendarNoticeMessage:
				"Google account connected, but calendar discovery needs another refresh.",
			calendarNoticeTone: "success",
		};
	}

	if (calendarConnectStatus === "connected") {
		return {
			calendarNoticeMessage: "Google account connected successfully.",
			calendarNoticeTone: "success",
		};
	}

	if (calendarConnectStatus === "error") {
		return {
			calendarNoticeMessage: "Google calendar connection failed. Try again.",
			calendarNoticeTone: "error",
		};
	}

	return {
		calendarNoticeMessage: null,
		calendarNoticeTone: "success",
	};
};
