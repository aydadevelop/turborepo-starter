<script lang="ts">
	import ListingEditorForm from "../../../../components/org/ListingEditorForm.svelte";
	import { Badge } from "@my-app/ui/components/badge";
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import WorkspaceActionDialog from "../shared/WorkspaceActionDialog.svelte";

	import type {
		ListingTypeOption,
		ListingWorkspaceState,
		OrpcInputs,
	} from "$lib/orpc-types";
	import type { ListingWorkspaceInitialValue } from "../types";

	let {
		workspace,
		initialValue = null,
		listingTypeOptions = [],
		onUpdateListing = null,
		updatePending = false,
		updateErrorMessage = null,
	}: {
		initialValue?: ListingWorkspaceInitialValue | null;
		listingTypeOptions?: ListingTypeOption[];
		onUpdateListing?: ((
			input: OrpcInputs["listing"]["create"]
		) => boolean | void | Promise<boolean | void>) | null;
		updateErrorMessage?: string | null;
		updatePending?: boolean;
		workspace: ListingWorkspaceState;
	} = $props();

	let basicsDialogOpen = $state(false);

	const serviceFamilyLabel = $derived(
		workspace.serviceFamilyPolicy?.label ?? "Unknown"
	);
	const bookingModeLabel = $derived(
		workspace.serviceFamilyPolicy?.customerPresentation.bookingMode ===
			"request"
			? "Request booking"
			: "Instant booking"
	);
	const customerFocusLabel = $derived(
		workspace.serviceFamilyPolicy?.customerPresentation.customerFocus ===
			"asset"
			? "Asset-first"
			: "Experience-first"
	);
	const reviewsModeLabel = $derived(
		workspace.serviceFamilyPolicy?.customerPresentation.reviewsMode ===
			"validated"
			? "Validated reviews"
			: "Standard reviews"
	);
	const publicationBadgeVariant = $derived(
		workspace.publication.isPublished ? "default" : "secondary"
	);
	const reviewBadgeVariant = $derived(
		workspace.publication.requiresReview ? "secondary" : "outline"
	);
	const operatorSections = $derived(
		workspace.serviceFamilyPolicy?.operatorSections ?? ["basics"]
	);
	const boatRentCaptainModeLabel = $derived.by(() => {
		switch (workspace.boatRentProfile?.captainMode) {
			case "captained_only":
				return "Captain included";
			case "self_drive_only":
				return "Self-drive only";
			case "captain_optional":
				return "Captain optional";
			default:
				return "Missing";
		}
	});
	const excursionGroupFormatLabel = $derived.by(() => {
		switch (workspace.excursionProfile?.groupFormat) {
			case "group":
				return "Group tour";
			case "private":
				return "Private tour";
			case "both":
				return "Private or group";
			default:
				return "Missing";
		}
	});

	async function handleUpdateListing(input: OrpcInputs["listing"]["create"]) {
		const result = await onUpdateListing?.(input);
		if (result !== false) {
			basicsDialogOpen = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="grid gap-4 md:grid-cols-3">
		<Card>
			<CardHeader class="pb-2">
				<CardDescription>Publication state</CardDescription>
				<div class="flex flex-wrap gap-2 pt-1">
					<Badge variant={publicationBadgeVariant}>
						{workspace.publication.isPublished ? "Published" : "Not published"}
					</Badge>
					<Badge variant={reviewBadgeVariant}>
						{workspace.publication.requiresReview
							? "Pending review"
							: "No review blocker"}
					</Badge>
				</div>
			</CardHeader>
			<CardContent class="text-sm text-muted-foreground">
				{workspace.publication.activePublicationCount}
				active publication{workspace.publication.activePublicationCount === 1 ? "" : "s"}
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-2">
				<CardDescription>Service family</CardDescription>
				<CardTitle class="text-base">{serviceFamilyLabel}</CardTitle>
			</CardHeader>
			<CardContent class="space-y-1 text-sm text-muted-foreground">
				<p>{bookingModeLabel}</p>
				<p>{customerFocusLabel}</p>
				<p>{reviewsModeLabel}</p>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-2">
				<CardDescription>Operator model</CardDescription>
				<CardTitle class="text-base">
					{workspace.serviceFamilyPolicy?.availabilityMode === "duration"
						? "Duration-led"
						: "Schedule-led"}
				</CardTitle>
			</CardHeader>
			<CardContent class="text-sm text-muted-foreground">
				Sections: {operatorSections.join(", ")}
			</CardContent>
		</Card>
	</div>

	<Card>
		<CardHeader class="gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div class="space-y-1">
				<CardTitle class="text-base">Basics</CardTitle>
				<CardDescription>
					Core listing details and current family policy.
				</CardDescription>
			</div>
			{#if onUpdateListing && initialValue}
				<WorkspaceActionDialog
					bind:open={basicsDialogOpen}
					triggerLabel="Edit basics"
					title="Edit basics"
					description="Update listing details and family-specific profile fields without leaving the workspace."
				>
					{#snippet children()}
						<ListingEditorForm
							mode="edit"
							initialValue={initialValue}
							{listingTypeOptions}
							submitLabel="Save basics"
							pending={updatePending}
							errorMessage={updateErrorMessage}
							onSubmit={handleUpdateListing}
							showCardChrome={false}
							showCancelButton={false}
						/>
					{/snippet}
				</WorkspaceActionDialog>
			{/if}
		</CardHeader>
		<CardContent class="grid gap-4 md:grid-cols-2">
			<div class="space-y-1 text-sm">
				<p class="font-medium">Listing type</p>
				<p class="text-muted-foreground">
					{workspace.listingType?.label ?? workspace.listing.listingTypeSlug}
				</p>
			</div>
			<div class="space-y-1 text-sm">
				<p class="font-medium">Timezone</p>
				<p class="text-muted-foreground">{workspace.listing.timezone}</p>
			</div>
			<div class="space-y-1 text-sm">
				<p class="font-medium">Required fields</p>
				<p class="text-muted-foreground">
					{workspace.listingType?.requiredFields.length
						? workspace.listingType.requiredFields.join(", ")
						: "No family-specific required fields"}
				</p>
			</div>
			<div class="space-y-1 text-sm">
				<p class="font-medium">Supported pricing models</p>
				<p class="text-muted-foreground">
					{workspace.listingType?.supportedPricingModels.length
						? workspace.listingType.supportedPricingModels.join(", ")
						: "No pricing models declared yet"}
				</p>
			</div>
			{#if workspace.boatRentProfile}
				<div class="space-y-1 text-sm">
					<p class="font-medium">Capacity</p>
					<p class="text-muted-foreground">
						{workspace.boatRentProfile.capacity ?? "Missing"}
					</p>
				</div>
				<div class="space-y-1 text-sm">
					<p class="font-medium">Captain policy</p>
					<p class="text-muted-foreground">{boatRentCaptainModeLabel}</p>
				</div>
				<div class="space-y-1 text-sm">
					<p class="font-medium">Departure area</p>
					<p class="text-muted-foreground">
						{workspace.boatRentProfile.departureArea ?? "Missing"}
					</p>
				</div>
				<div class="space-y-1 text-sm">
					<p class="font-medium">Base port</p>
					<p class="text-muted-foreground">
						{workspace.boatRentProfile.basePort ?? "Missing"}
					</p>
				</div>
			{/if}
			{#if workspace.excursionProfile}
				<div class="space-y-1 text-sm">
					<p class="font-medium">Meeting point</p>
					<p class="text-muted-foreground">
						{workspace.excursionProfile.meetingPoint ?? "Missing"}
					</p>
				</div>
				<div class="space-y-1 text-sm">
					<p class="font-medium">Duration</p>
					<p class="text-muted-foreground">
						{workspace.excursionProfile.durationMinutes
							? `${workspace.excursionProfile.durationMinutes} min`
							: "Missing"}
					</p>
				</div>
				<div class="space-y-1 text-sm">
					<p class="font-medium">Group format</p>
					<p class="text-muted-foreground">{excursionGroupFormatLabel}</p>
				</div>
				<div class="space-y-1 text-sm">
					<p class="font-medium">Primary language</p>
					<p class="text-muted-foreground">
						{workspace.excursionProfile.primaryLanguage ?? "Missing"}
					</p>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
