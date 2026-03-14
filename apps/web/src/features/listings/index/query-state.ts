import { createMutation, createQuery } from "@tanstack/svelte-query";
import { orpc, queryClient } from "$lib/orpc";

export const invalidateOrganizationListingViews = async () => {
	await Promise.all([
		queryClient.invalidateQueries({
			queryKey: orpc.organization.key(),
		}),
		queryClient.invalidateQueries({
			queryKey: orpc.listing.key(),
		}),
	]);
};

export const createOrganizationListingsQueries = () => ({
	overlaySummaryQuery: createQuery(() =>
		orpc.organization.getOverlaySummary.queryOptions({
			input: {},
		}),
	),
	listingsQuery: createQuery(() =>
		orpc.listing.list.queryOptions({
			input: {
				page: {
					limit: 50,
					offset: 0,
				},
			},
		}),
	),
});

export const createOrganizationListingsMutations = () => ({
	createManualOverride: createMutation(() =>
		orpc.organization.createManualOverride.mutationOptions({
			onSuccess: invalidateOrganizationListingViews,
		}),
	),
	resolveManualOverride: createMutation(() =>
		orpc.organization.resolveManualOverride.mutationOptions({
			onSuccess: invalidateOrganizationListingViews,
		}),
	),
	approveListing: createMutation(() =>
		orpc.organization.approveListing.mutationOptions({
			onSuccess: invalidateOrganizationListingViews,
		}),
	),
	clearListingApproval: createMutation(() =>
		orpc.organization.clearListingApproval.mutationOptions({
			onSuccess: invalidateOrganizationListingViews,
		}),
	),
	publishListingToChannel: createMutation(() =>
		orpc.organization.publishListingToChannel.mutationOptions({
			onSuccess: invalidateOrganizationListingViews,
		}),
	),
	unpublishListing: createMutation(() =>
		orpc.organization.unpublishListing.mutationOptions({
			onSuccess: invalidateOrganizationListingViews,
		}),
	),
});
