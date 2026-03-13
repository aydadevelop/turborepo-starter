<script lang="ts">
	import OrganizationOverlayBlockersSection from "./OrganizationOverlayBlockersSection.svelte";
	import OrganizationOverlayDistributionSection from "./OrganizationOverlayDistributionSection.svelte";
	import OrganizationManualOverridesSection from "./OrganizationManualOverridesSection.svelte";
	import OrganizationOverlayModerationSection from "./OrganizationOverlayModerationSection.svelte";
	import OrganizationOverlayReadinessSection from "./OrganizationOverlayReadinessSection.svelte";
	import OrganizationOverlaySummaryCards from "./OrganizationOverlaySummaryCards.svelte";
	import type { OrganizationOverlayPanelProps } from "./types";

	let {
		overlay,
		listingOptions = [],
		createPending = false,
		resolvePendingId = null,
		createError = null,
		moderationPending = false,
		moderationError = null,
		distributionPending = false,
		distributionError = null,
		onCreateManualOverride,
		onResolveManualOverride,
		onApproveListing,
		onClearListingApproval,
		onPublishListingToChannel,
		onUnpublishListing,
	}: OrganizationOverlayPanelProps = $props();
</script>

<div class="space-y-4">
	<OrganizationOverlaySummaryCards {overlay} />

	<div class="grid gap-4 xl:grid-cols-3">
		<OrganizationOverlayDistributionSection
			{overlay}
			{listingOptions}
			{distributionPending}
			{distributionError}
			{onPublishListingToChannel}
			{onUnpublishListing}
		/>
		<OrganizationOverlayModerationSection
			{overlay}
			{listingOptions}
			{moderationPending}
			{moderationError}
			{onApproveListing}
			{onClearListingApproval}
		/>
		<OrganizationOverlayBlockersSection {overlay} />
	</div>

	<OrganizationOverlayReadinessSection {overlay} />

	<OrganizationManualOverridesSection
		{overlay}
		{listingOptions}
		{createPending}
		{resolvePendingId}
		{createError}
		{onCreateManualOverride}
		{onResolveManualOverride}
	/>
</div>
