<script lang="ts">
	import { page } from "$app/state";
	import type { OrpcInputs } from "$lib/orpc-types";
	import ListingWorkspaceSections from "./ListingWorkspaceSections.svelte";
	import {
		buildCalendarWorkspaceNotice,
		buildListingWorkspaceInitialValue,
		createListingWorkspaceMutations,
		createListingWorkspaceQueries,
		getGoogleCalendarConnectUrl,
	} from "./query-state";

	let { listingId }: { listingId: string } = $props();

	const {
		workspaceStateQuery,
		assetWorkspaceQuery,
		pricingWorkspaceQuery,
		availabilityWorkspaceQuery,
		calendarWorkspaceQuery,
		moderationAuditQuery,
	} = createListingWorkspaceQueries(() => listingId);
	const {
		updateListingMutation,
		createPricingProfileMutation,
		addPricingRuleMutation,
		addAvailabilityRuleMutation,
		addAvailabilityBlockMutation,
		addAvailabilityExceptionMutation,
		refreshCalendarSourcesMutation,
		attachCalendarSourceMutation,
		disconnectConnectionMutation,
		approveListingMutation,
		clearListingApprovalMutation,
		publishListingToChannelMutation,
		unpublishListingMutation,
	} = createListingWorkspaceMutations(() => listingId);
	let refreshingAccountId = $state<string | null>(null);
	let attachingSourceId = $state<string | null>(null);

	const refreshCalendarSources = async (accountId: string) => {
		refreshingAccountId = accountId;
		try {
			await refreshCalendarSourcesMutation.mutateAsync({ accountId });
		} finally {
			refreshingAccountId = null;
		}
	};

	const attachCalendarSource = async (sourceId: string) => {
		attachingSourceId = sourceId;
		try {
			await attachCalendarSourceMutation.mutateAsync({
				listingId,
				sourceId,
			});
		} finally {
			attachingSourceId = null;
		}
	};

	const detachConnection = async (connectionId: string) => {
		await disconnectConnectionMutation.mutateAsync({ connectionId });
	};

	const createPricingProfile = async (input: {
		baseHourlyPriceCents: number;
		currency: string;
		isDefault?: boolean;
		listingId: string;
		minimumHours?: number;
		name: string;
		serviceFeeBps?: number;
		taxBps?: number;
	}) => {
		try {
			await createPricingProfileMutation.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const createPricingRule = async (input: {
		adjustmentType: "flat_cents" | "percent";
		adjustmentValue: number;
		conditionJson: Record<string, unknown>;
		listingId: string;
		name: string;
		priority?: number;
		pricingProfileId: string;
		ruleType: string;
	}) => {
		try {
			await addPricingRuleMutation.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const addAvailabilityRule = async (input: {
		dayOfWeek: number;
		endMinute: number;
		listingId: string;
		startMinute: number;
	}) => {
		try {
			await addAvailabilityRuleMutation.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const addAvailabilityBlock = async (input: {
		endsAt: string;
		listingId: string;
		reason?: string;
		startsAt: string;
	}) => {
		try {
			await addAvailabilityBlockMutation.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const addAvailabilityException = async (input: {
		date: string;
		endMinute?: number;
		isAvailable: boolean;
		listingId: string;
		reason?: string;
		startMinute?: number;
	}) => {
		try {
			await addAvailabilityExceptionMutation.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const approveListing = async (input: {
		listingId: string;
		note?: string;
	}) => {
		try {
			await approveListingMutation.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const clearListingApproval = async (input: {
		listingId: string;
		note?: string;
	}) => {
		try {
			await clearListingApprovalMutation.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const publishListingToChannel = async (input: {
		channelType: "own_site" | "platform_marketplace";
		listingId: string;
	}) => {
		try {
			await publishListingToChannelMutation.mutateAsync(input);
			return true;
		} catch {
			return false;
		}
	};

	const unpublishListing = async (listingIdToUnpublish: string) => {
		try {
			await unpublishListingMutation.mutateAsync({
				listingId: listingIdToUnpublish,
			});
			return true;
		} catch {
			return false;
		}
	};

	const googleCalendarConnectUrl = $derived(
		getGoogleCalendarConnectUrl(page.url.pathname)
	);
	const calendarNotice = $derived(
		buildCalendarWorkspaceNotice(page.url.searchParams)
	);
	const initialValue = $derived(
		buildListingWorkspaceInitialValue(workspaceStateQuery.data)
	);

	const updateListing = async (input: OrpcInputs["listing"]["create"]) => {
		try {
			await updateListingMutation.mutateAsync({
				id: listingId,
				name: input.name,
				timezone: input.timezone,
				description: input.description,
				metadata: input.metadata,
				serviceFamilyDetails: input.serviceFamilyDetails,
			});
			return true;
		} catch {
			return false;
		}
	};
</script>

<div class="mx-auto max-w-5xl space-y-4">
	<div class="space-y-1">
		<h2 class="text-2xl font-semibold tracking-tight">Listing workspace</h2>
		<p class="text-sm text-muted-foreground">
			Operate this listing through backend-owned workspace state instead of raw
			table views.
		</p>
	</div>

	{#if workspaceStateQuery.isPending}
		<div class="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
			Loading listing workspace...
		</div>
	{:else if workspaceStateQuery.isError}
		<div
			class="rounded-lg border border-destructive bg-card p-6 text-sm text-destructive"
		>
			{workspaceStateQuery.error?.message ?? "Failed to load listing workspace."}
		</div>
	{:else if initialValue}
		<ListingWorkspaceSections
			workspace={workspaceStateQuery.data}
			assets={assetWorkspaceQuery.data ?? null}
			pricing={pricingWorkspaceQuery.data ?? null}
			availability={availabilityWorkspaceQuery.data ?? null}
			calendar={calendarWorkspaceQuery.data ?? null}
			moderationAudit={moderationAuditQuery.data ?? null}
			{initialValue}
			listingTypeOptions={workspaceStateQuery.data.listingType
				? [workspaceStateQuery.data.listingType]
				: []}
			onUpdateListing={updateListing}
			updatePending={updateListingMutation.isPending}
			updateErrorMessage={updateListingMutation.error?.message ?? null}
			onCreatePricingProfile={createPricingProfile}
			pricingSubmitPending={createPricingProfileMutation.isPending}
			pricingActionErrorMessage={createPricingProfileMutation.error?.message ??
				null}
			onCreatePricingRule={createPricingRule}
			pricingRuleSubmitPending={addPricingRuleMutation.isPending}
			pricingRuleActionErrorMessage={addPricingRuleMutation.error?.message ??
				null}
			onAddAvailabilityRule={addAvailabilityRule}
			availabilitySubmitPending={addAvailabilityRuleMutation.isPending}
			availabilityActionErrorMessage={addAvailabilityRuleMutation.error
				?.message ?? null}
			onAddAvailabilityBlock={addAvailabilityBlock}
			availabilityBlockSubmitPending={addAvailabilityBlockMutation.isPending}
			availabilityBlockActionErrorMessage={addAvailabilityBlockMutation.error
				?.message ?? null}
			onAddAvailabilityException={addAvailabilityException}
			availabilityExceptionSubmitPending={addAvailabilityExceptionMutation.isPending}
			availabilityExceptionActionErrorMessage={addAvailabilityExceptionMutation.error?.message ?? null}
			{googleCalendarConnectUrl}
			onRefreshCalendarAccountSources={refreshCalendarSources}
			onAttachCalendarSource={attachCalendarSource}
			onDetachConnection={detachConnection}
			{refreshingAccountId}
			{attachingSourceId}
			calendarActionErrorMessage={refreshCalendarSourcesMutation.error?.message ??
				attachCalendarSourceMutation.error?.message ??
				disconnectConnectionMutation.error?.message ??
				null}
			calendarNoticeMessage={calendarNotice.calendarNoticeMessage}
			calendarNoticeTone={calendarNotice.calendarNoticeTone}
			onApproveListing={approveListing}
			onClearListingApproval={clearListingApproval}
			onPublishListingToChannel={publishListingToChannel}
			onUnpublishListing={unpublishListing}
			moderationSubmitPending={approveListingMutation.isPending ||
				clearListingApprovalMutation.isPending}
			moderationActionErrorMessage={approveListingMutation.error?.message ??
				clearListingApprovalMutation.error?.message ??
				null}
			distributionSubmitPending={publishListingToChannelMutation.isPending ||
				unpublishListingMutation.isPending}
			distributionErrorMessage={publishListingToChannelMutation.error?.message ??
				unpublishListingMutation.error?.message ??
				null}
		/>
	{/if}
</div>
