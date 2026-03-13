<!-- biome-ignore-all format: section composition -->
<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import { Separator } from "@my-app/ui/components/separator";
	import ConfirmActionDialog from "../../../../components/admin/ConfirmActionDialog.svelte";
	import WorkspaceActionDialog from "../shared/WorkspaceActionDialog.svelte";
	import ListingDistributionActionForm from "./ListingDistributionActionForm.svelte";
	import ListingModerationActionForm from "./ListingModerationActionForm.svelte";

	import type {
		ListingModerationAuditEntry,
		ListingWorkspaceState,
	} from "$lib/orpc-types";

	let {
		workspace,
		moderationAudit = null,
		onApproveListing = null,
		onClearListingApproval = null,
		onPublishListingToChannel = null,
		onUnpublishListing = null,
		moderationPending = false,
		moderationError = null,
		distributionPending = false,
		distributionError = null,
	}: {
		distributionError?: string | null;
		distributionPending?: boolean;
		workspace: ListingWorkspaceState;
		moderationAudit?: ListingModerationAuditEntry[] | null;
		moderationError?: string | null;
		moderationPending?: boolean;
		onApproveListing?: ((input: {
			listingId: string;
			note?: string;
		}) => boolean | void | Promise<boolean | void>) | null;
		onClearListingApproval?: ((input: {
			listingId: string;
			note?: string;
		}) => boolean | void | Promise<boolean | void>) | null;
		onPublishListingToChannel?: ((input: {
			channelType: "own_site" | "platform_marketplace";
			listingId: string;
		}) => boolean | void | Promise<boolean | void>) | null;
		onUnpublishListing?: ((listingId: string) => boolean | void | Promise<boolean | void>) | null;
	} = $props();

	let approveDialogOpen = $state(false);
	let clearDialogOpen = $state(false);
	let publishDialogOpen = $state(false);
	let unpublishDialogOpen = $state(false);

	async function handleApproveListing(input: {
		listingId: string;
		note?: string;
	}) {
		const result = await onApproveListing?.(input);
		if (result !== false) {
			approveDialogOpen = false;
		}
	}

	async function handleClearListingApproval(input: {
		listingId: string;
		note?: string;
	}) {
		const result = await onClearListingApproval?.(input);
		if (result !== false) {
			clearDialogOpen = false;
		}
	}

	async function handlePublishListingToChannel(input: {
		channelType: "own_site" | "platform_marketplace";
		listingId: string;
	}) {
		const result = await onPublishListingToChannel?.(input);
		if (result !== false) {
			publishDialogOpen = false;
		}
	}

	async function handleUnpublishListing() {
		const result = await onUnpublishListing?.(workspace.listing.id);
		if (result !== false) {
			unpublishDialogOpen = false;
		}
	}
</script>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Publish readiness</CardTitle>
		<CardDescription>
			Current publication state and family-level launch expectations.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		<div class="space-y-2 text-sm text-muted-foreground">
			<p>
				Moderation required:
				{workspace.serviceFamilyPolicy?.defaults.moderationRequired ? " yes" : " no"}
			</p>
			<p>
				Location required:
				{workspace.serviceFamilyPolicy?.defaults.requiresLocation ? " yes" : " no"}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if onApproveListing}
				<WorkspaceActionDialog
					bind:open={approveDialogOpen}
					triggerLabel="Approve listing"
					title="Approve listing"
					description="Record a moderation note for this approval action."
				>
					{#snippet children()}
						<ListingModerationActionForm
							listingId={workspace.listing.id}
							mode="approve"
							onSubmit={handleApproveListing}
							pending={moderationPending}
							errorMessage={moderationError}
							showIntro={false}
						/>
					{/snippet}
				</WorkspaceActionDialog>
			{/if}
			{#if onClearListingApproval}
				<WorkspaceActionDialog
					bind:open={clearDialogOpen}
					triggerLabel="Clear approval"
					title="Clear approval"
					description="Document why the current approval is being removed."
				>
					{#snippet children()}
						<ListingModerationActionForm
							listingId={workspace.listing.id}
							mode="clear"
							onSubmit={handleClearListingApproval}
							pending={moderationPending}
							errorMessage={moderationError}
							showIntro={false}
						/>
					{/snippet}
				</WorkspaceActionDialog>
			{/if}
			{#if onPublishListingToChannel}
				<WorkspaceActionDialog
					bind:open={publishDialogOpen}
					triggerLabel="Publish to channel"
					title="Publish to channel"
					description="Choose which channel should receive this listing."
				>
					{#snippet children()}
						<ListingDistributionActionForm
							listingId={workspace.listing.id}
							onSubmit={handlePublishListingToChannel}
							pending={distributionPending}
							errorMessage={distributionError}
							showIntro={false}
						/>
					{/snippet}
				</WorkspaceActionDialog>
			{/if}
			{#if onUnpublishListing}
				<Button
					variant="outline"
					onclick={() => {
						unpublishDialogOpen = true;
					}}
				>
					Unpublish all
				</Button>
			{/if}
		</div>
		<Separator />
		<div class="space-y-3">
			<p class="text-sm text-muted-foreground">
				Use the publication controls on the listings index to publish or
				unpublish this listing while the workspace keeps the underlying family
				rules visible.
			</p>
			<div class="space-y-2">
				<p class="text-sm font-medium">Moderation audit</p>
				{#if moderationAudit?.length}
					<div class="space-y-2">
						{#each moderationAudit as item (item.id)}
							<div class="rounded-lg border p-3 text-sm">
								<div class="flex flex-wrap items-center gap-2">
									<Badge variant="outline">
										{item.action === "approved"
											? "Approved"
											: "Approval cleared"}
									</Badge>
									<span class="text-muted-foreground">
										{new Date(item.actedAt).toLocaleString()}
									</span>
								</div>
								<p class="mt-2 text-muted-foreground">
									By {item.actedByDisplayName ?? item.actedByUserId ?? "Unknown operator"}
								</p>
								{#if item.note}
									<p class="mt-1 text-muted-foreground">{item.note}</p>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">
						No moderation actions recorded yet.
					</p>
				{/if}
			</div>
		</div>
	</CardContent>
</Card>

{#if onUnpublishListing}
	<ConfirmActionDialog
		bind:open={unpublishDialogOpen}
		title="Unpublish all channels"
		description="Remove this listing from all active publication channels."
		confirmLabel="Unpublish all"
		pendingLabel="Unpublishing..."
		pending={distributionPending}
		errorMessage={distributionError}
		onConfirm={handleUnpublishListing}
	/>
{/if}
