<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import type { OrganizationOverlaySummary } from "$lib/orpc-types";
	import WorkspaceActionDialog from "../workspace/shared/WorkspaceActionDialog.svelte";
	import ListingModerationActionForm from "../workspace/publish/ListingModerationActionForm.svelte";
	import type { OrganizationOverlayListingOption } from "./types";

	let {
		overlay,
		listingOptions = [],
		moderationPending = false,
		moderationError = null,
		onApproveListing,
		onClearListingApproval,
	}: {
		overlay: OrganizationOverlaySummary;
		listingOptions?: OrganizationOverlayListingOption[];
		moderationPending?: boolean;
		moderationError?: string | null;
		onApproveListing: (input: {
			listingId: string;
			note?: string;
		}) => boolean | void | Promise<boolean | void>;
		onClearListingApproval: (input: {
			listingId: string;
			note?: string;
		}) => boolean | void | Promise<boolean | void>;
	} = $props();

	let approveDialogOpen = $state(false);
	let clearDialogOpen = $state(false);

	async function handleApproveListing(input: {
		listingId: string;
		note?: string;
	}) {
		const result = await onApproveListing(input);
		if (result !== false) {
			approveDialogOpen = false;
		}
	}

	async function handleClearListingApproval(input: {
		listingId: string;
		note?: string;
	}) {
		const result = await onClearListingApproval(input);
		if (result !== false) {
			clearDialogOpen = false;
		}
	}
</script>

<Card>
	<CardHeader class="pb-2">
		<CardDescription>Moderation</CardDescription>
		<CardTitle class="text-base">
			{overlay.moderation.reviewPendingCount} pending review
		</CardTitle>
	</CardHeader>
	<CardContent class="space-y-3 text-sm text-muted-foreground">
		<p>
			{overlay.moderation.approvedListingCount} approved /
			{overlay.moderation.unapprovedActiveListingCount} active without approval
		</p>
		<div class="flex flex-wrap gap-2">
			<WorkspaceActionDialog
				bind:open={approveDialogOpen}
				triggerLabel="Approve listing"
				title="Approve listing"
				description="Choose a listing and record the moderation note for this approval."
				triggerDisabled={listingOptions.length === 0}
			>
				{#snippet children()}
					<ListingModerationActionForm
						mode="approve"
						listingOptions={listingOptions}
						onSubmit={handleApproveListing}
						pending={moderationPending}
						errorMessage={moderationError}
						showIntro={false}
					/>
				{/snippet}
			</WorkspaceActionDialog>

			<WorkspaceActionDialog
				bind:open={clearDialogOpen}
				triggerLabel="Clear approval"
				title="Clear approval"
				description="Choose a listing and document why the current approval should be removed."
				triggerDisabled={listingOptions.length === 0}
			>
				{#snippet children()}
					<ListingModerationActionForm
						mode="clear"
						listingOptions={listingOptions}
						onSubmit={handleClearListingApproval}
						pending={moderationPending}
						errorMessage={moderationError}
						showIntro={false}
					/>
				{/snippet}
			</WorkspaceActionDialog>
		</div>
	</CardContent>
</Card>
