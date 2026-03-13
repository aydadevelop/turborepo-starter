<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { Card, CardContent } from "@my-app/ui/components/card";
	import OrganizationOverlayPanel from "../overlay/OrganizationOverlayPanel.svelte";
	import ListingCatalogGrid from "./ListingCatalogGrid.svelte";
	import {
		createOrganizationListingsMutations,
		createOrganizationListingsQueries,
	} from "./query-state";

	const { overlaySummaryQuery, listingsQuery } = createOrganizationListingsQueries();
	const {
		createManualOverride,
		resolveManualOverride,
		approveListing,
		clearListingApproval,
		publishListingToChannel,
		unpublishListing,
	} = createOrganizationListingsMutations();

	const listings = $derived(listingsQuery.data?.items ?? []);
	const listingOptions = $derived(
		listings.map((item) => ({
			id: item.id,
			name: item.name,
		}))
	);
	const totalListings = $derived(
		listingsQuery.data?.page.total ?? listings.length
	);

	let resolvePendingId = $state<string | null>(null);

	const createManualOverrideAction = async (input: {
		scopeType: "organization" | "listing";
		scopeKey?: string | null;
		code: string;
		title: string;
		note?: string;
	}) => {
		try {
			await createManualOverride.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const resolveManualOverrideAction = async (id: string) => {
		resolvePendingId = id;
		try {
			await resolveManualOverride.mutateAsync({ id });
			return true;
		} catch {
			return false;
		} finally {
			resolvePendingId = null;
		}
	};

	const approveListingAction = async (input: {
		listingId: string;
		note?: string;
	}) => {
		try {
			await approveListing.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const clearListingApprovalAction = async (input: {
		listingId: string;
		note?: string;
	}) => {
		try {
			await clearListingApproval.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const publishListingToChannelAction = async (input: {
		listingId: string;
		channelType: "own_site" | "platform_marketplace";
	}) => {
		try {
			await publishListingToChannel.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const unpublishListingAction = async (listingId: string) => {
		try {
			await unpublishListing.mutateAsync({ listingId });
			return true;
		} catch {
			return false;
		}
	};
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="space-y-1">
			<h2 class="text-2xl font-semibold tracking-tight">Listings</h2>
			<p class="text-sm text-muted-foreground">
				Manage your organization’s catalog and marketplace publication state.
			</p>
		</div>

		<Button href="/org/listings/new">Create listing</Button>
	</div>

	{#if overlaySummaryQuery.data}
		<OrganizationOverlayPanel
			overlay={overlaySummaryQuery.data}
			{listingOptions}
			createPending={createManualOverride.isPending}
			resolvePendingId={resolvePendingId}
			createError={createManualOverride.error?.message ?? null}
			moderationPending={approveListing.isPending || clearListingApproval.isPending}
			moderationError={approveListing.error?.message ??
				clearListingApproval.error?.message ??
				null}
			distributionPending={publishListingToChannel.isPending || unpublishListing.isPending}
			distributionError={publishListingToChannel.error?.message ??
				unpublishListing.error?.message ??
				null}
			onCreateManualOverride={createManualOverrideAction}
			onResolveManualOverride={resolveManualOverrideAction}
			onApproveListing={approveListingAction}
			onClearListingApproval={clearListingApprovalAction}
			onPublishListingToChannel={publishListingToChannelAction}
			onUnpublishListing={unpublishListingAction}
		/>
	{/if}

	{#if listingsQuery.isPending}
		<div class="grid gap-4 md:grid-cols-2">
			{#each Array.from({ length: 4 }) as _, index (`skeleton-${index}`)}
				<Card class="animate-pulse">
					<CardContent class="space-y-3 py-6">
						<div class="h-5 w-2/3 rounded bg-muted"></div>
						<div class="h-4 w-1/3 rounded bg-muted/70"></div>
						<div class="h-16 rounded bg-muted/60"></div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{:else if listingsQuery.isError}
		<Card class="border-destructive">
			<CardContent class="py-6">
				<p class="text-sm text-destructive">
					{listingsQuery.error?.message ?? "Failed to load listings."}
				</p>
			</CardContent>
		</Card>
	{:else if listings.length === 0}
		<Card>
			<CardContent class="space-y-3 py-6">
				<p class="text-sm text-muted-foreground">
					No listings yet. Create your first listing to start building your catalog.
				</p>
				<Button href="/org/listings/new" variant="outline">
					Create your first listing
				</Button>
			</CardContent>
		</Card>
	{:else}
		<ListingCatalogGrid listings={listings} total={totalListings} />
	{/if}
</div>
