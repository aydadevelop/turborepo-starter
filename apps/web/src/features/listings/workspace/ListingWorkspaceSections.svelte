<script lang="ts">
	import {
		Tabs,
		TabsContent,
		TabsList,
		TabsTrigger,
	} from "@my-app/ui/components/tabs";
	import ListingWorkspaceAssetsSection from "./assets/ListingWorkspaceAssetsSection.svelte";
	import ListingWorkspaceAvailabilitySection from "./availability/ListingWorkspaceAvailabilitySection.svelte";
	import ListingWorkspaceBasicsSection from "./basics/ListingWorkspaceBasicsSection.svelte";
	import ListingWorkspaceCalendarSection from "./calendar/ListingWorkspaceCalendarSection.svelte";
	import ListingWorkspacePricingSection from "./pricing/ListingWorkspacePricingSection.svelte";
	import ListingWorkspacePublishSection from "./publish/ListingWorkspacePublishSection.svelte";

	import type { ListingWorkspaceSectionsProps } from "./types";

	let {
		workspace,
		assets = null,
		pricing = null,
		availability = null,
		calendar = null,
		moderationAudit = null,
		initialValue = null,
		listingTypeOptions = [],
		onUpdateListing = null,
		updatePending = false,
		updateErrorMessage = null,
		onCreatePricingProfile = null,
		pricingSubmitPending = false,
		pricingActionErrorMessage = null,
		onCreatePricingRule = null,
		pricingRuleSubmitPending = false,
		pricingRuleActionErrorMessage = null,
		onAddAvailabilityRule = null,
		availabilitySubmitPending = false,
		availabilityActionErrorMessage = null,
		onAddAvailabilityBlock = null,
		availabilityBlockSubmitPending = false,
		availabilityBlockActionErrorMessage = null,
		onAddAvailabilityException = null,
		availabilityExceptionSubmitPending = false,
		availabilityExceptionActionErrorMessage = null,
		googleCalendarConnectUrl = null,
		onRefreshCalendarAccountSources = null,
		onAttachCalendarSource = null,
		refreshingAccountId = null,
		attachingSourceId = null,
		calendarActionErrorMessage = null,
		calendarNoticeMessage = null,
		calendarNoticeTone = "success",
		onApproveListing = null,
		onClearListingApproval = null,
		onPublishListingToChannel = null,
		onUnpublishListing = null,
		moderationSubmitPending = false,
		moderationActionErrorMessage = null,
		distributionSubmitPending = false,
		distributionErrorMessage = null,
	}: ListingWorkspaceSectionsProps = $props();

	const operatorSections = $derived(
		workspace.serviceFamilyPolicy?.operatorSections ?? ["basics"]
	);
</script>

<div class="space-y-4">
	<Tabs value={operatorSections[0] ?? "basics"}>
		<TabsList class="flex w-full flex-wrap gap-2">
			{#each operatorSections as section (section)}
				<TabsTrigger value={section} class="capitalize">
					{section}
				</TabsTrigger>
			{/each}
		</TabsList>

		<TabsContent value="basics" class="mt-4">
			<ListingWorkspaceBasicsSection
				{workspace}
				{initialValue}
				{listingTypeOptions}
				{onUpdateListing}
				{updatePending}
				{updateErrorMessage}
			/>
		</TabsContent>

		<TabsContent value="pricing" class="mt-4">
			<ListingWorkspacePricingSection
				{pricing}
				listingId={workspace.listing.id}
				{onCreatePricingProfile}
				pending={pricingSubmitPending}
				errorMessage={pricingActionErrorMessage}
				{onCreatePricingRule}
				rulePending={pricingRuleSubmitPending}
				ruleErrorMessage={pricingRuleActionErrorMessage}
			/>
		</TabsContent>

		<TabsContent value="availability" class="mt-4">
			<ListingWorkspaceAvailabilitySection
				{availability}
				listingId={workspace.listing.id}
				{onAddAvailabilityRule}
				pending={availabilitySubmitPending}
				errorMessage={availabilityActionErrorMessage}
				{onAddAvailabilityBlock}
				blockPending={availabilityBlockSubmitPending}
				blockErrorMessage={availabilityBlockActionErrorMessage}
				{onAddAvailabilityException}
				exceptionPending={availabilityExceptionSubmitPending}
				exceptionErrorMessage={availabilityExceptionActionErrorMessage}
			/>
		</TabsContent>

		<TabsContent value="assets" class="mt-4">
			<ListingWorkspaceAssetsSection {assets} />
		</TabsContent>

		<TabsContent value="calendar" class="mt-4">
			<ListingWorkspaceCalendarSection
				{calendar}
				{googleCalendarConnectUrl}
				{onRefreshCalendarAccountSources}
				{onAttachCalendarSource}
				{refreshingAccountId}
				{attachingSourceId}
				{calendarActionErrorMessage}
				{calendarNoticeMessage}
				{calendarNoticeTone}
			/>
		</TabsContent>

		<TabsContent value="publish" class="mt-4">
			<ListingWorkspacePublishSection
				{workspace}
				{moderationAudit}
				{onApproveListing}
				{onClearListingApproval}
				{onPublishListingToChannel}
				{onUnpublishListing}
				moderationPending={moderationSubmitPending}
				moderationError={moderationActionErrorMessage}
				distributionPending={distributionSubmitPending}
				distributionError={distributionErrorMessage}
			/>
		</TabsContent>
	</Tabs>
</div>
