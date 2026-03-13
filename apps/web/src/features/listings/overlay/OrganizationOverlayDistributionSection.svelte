<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import {
		Option as NativeSelectOption,
		Root as NativeSelectRoot,
	} from "@my-app/ui/components/native-select";
	import ConfirmActionDialog from "../../../components/admin/ConfirmActionDialog.svelte";
	import type { OrganizationOverlaySummary } from "$lib/orpc-types";
	import WorkspaceActionDialog from "../workspace/shared/WorkspaceActionDialog.svelte";
	import ListingDistributionActionForm from "../workspace/publish/ListingDistributionActionForm.svelte";
	import type {
		DistributionActionInput,
		OrganizationOverlayListingOption,
	} from "./types";

	let {
		overlay,
		listingOptions = [],
		distributionPending = false,
		distributionError = null,
		onPublishListingToChannel,
		onUnpublishListing,
	}: {
		overlay: OrganizationOverlaySummary;
		listingOptions?: OrganizationOverlayListingOption[];
		distributionPending?: boolean;
		distributionError?: string | null;
		onPublishListingToChannel: (
			input: DistributionActionInput
		) => boolean | void | Promise<boolean | void>;
		onUnpublishListing: (
			listingId: string
		) => boolean | void | Promise<boolean | void>;
	} = $props();

	let publishDialogOpen = $state(false);
	let unpublishDialogOpen = $state(false);
	let selectedListingId = $state("");

	async function handlePublish(input: DistributionActionInput) {
		const result = await onPublishListingToChannel(input);
		if (result !== false) {
			publishDialogOpen = false;
		}
	}

	async function handleUnpublish() {
		const result = await onUnpublishListing(selectedListingId);
		if (result !== false) {
			unpublishDialogOpen = false;
		}
	}
</script>

<Card>
	<CardHeader class="pb-2">
		<CardDescription>Distribution</CardDescription>
		<CardTitle class="text-base">
			{overlay.distribution.marketplacePublicationCount} marketplace /
			{overlay.distribution.ownSitePublicationCount} own site
		</CardTitle>
	</CardHeader>
	<CardContent class="space-y-3 text-sm text-muted-foreground">
		<p>
			{overlay.distribution.listingsWithoutPublicationCount}
			listings still need a publication channel.
		</p>
		<div class="flex flex-wrap gap-2">
			<WorkspaceActionDialog
				bind:open={publishDialogOpen}
				triggerLabel="Publish to channel"
				title="Publish to channel"
				description="Choose the listing and distribution channel for this publication action."
				triggerDisabled={listingOptions.length === 0}
			>
				{#snippet children()}
					<ListingDistributionActionForm
						listingOptions={listingOptions}
						onSubmit={handlePublish}
						pending={distributionPending}
						errorMessage={distributionError}
						showIntro={false}
					/>
				{/snippet}
			</WorkspaceActionDialog>

			<Button
				variant="outline"
				disabled={distributionPending || listingOptions.length === 0}
				onclick={() => {
					unpublishDialogOpen = true;
				}}
			>
				Unpublish all
			</Button>
		</div>

		<div class="space-y-2">
			<label class="text-xs font-medium text-foreground" for="overlay-unpublish-listing">
				Listing to unpublish
			</label>
			<NativeSelectRoot
				id="overlay-unpublish-listing"
				bind:value={selectedListingId}
			>
				<NativeSelectOption value="">Select listing</NativeSelectOption>
				{#each listingOptions as option (option.id)}
					<NativeSelectOption value={option.id}>{option.name}</NativeSelectOption>
				{/each}
			</NativeSelectRoot>
		</div>
	</CardContent>
</Card>

<ConfirmActionDialog
	bind:open={unpublishDialogOpen}
	title="Unpublish all channels"
	description="Remove the selected listing from all active publication channels."
	confirmLabel="Unpublish all"
	pendingLabel="Unpublishing..."
	pending={distributionPending}
	errorMessage={distributionError}
	confirmDisabled={selectedListingId.length === 0}
	onConfirm={handleUnpublish}
/>
