<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import { Badge } from "@my-app/ui/components/badge";
	import CreatePricingProfileForm from "./CreatePricingProfileForm.svelte";
	import CreatePricingRuleForm from "./CreatePricingRuleForm.svelte";
	import WorkspaceActionDialog from "../shared/WorkspaceActionDialog.svelte";

	import type { PricingWorkspaceState } from "$lib/orpc-types";

	let {
		listingId,
		pricing = null,
		onCreatePricingProfile = null,
		pending = false,
		errorMessage = null,
		onCreatePricingRule = null,
		rulePending = false,
		ruleErrorMessage = null,
	}: {
		errorMessage?: string | null;
		listingId: string;
		onCreatePricingProfile?: ((input: {
			baseHourlyPriceCents: number;
			currency: string;
			isDefault?: boolean;
			listingId: string;
			minimumHours?: number;
			name: string;
			serviceFeeBps?: number;
			taxBps?: number;
		}) => boolean | void | Promise<boolean | void>) | null;
		onCreatePricingRule?: ((input: {
			adjustmentType: "flat_cents" | "percent";
			adjustmentValue: number;
			conditionJson: Record<string, unknown>;
			listingId: string;
			name: string;
			priority?: number;
			pricingProfileId: string;
			ruleType: string;
		}) => boolean | void | Promise<boolean | void>) | null;
		pending?: boolean;
		pricing?: PricingWorkspaceState | null;
		ruleErrorMessage?: string | null;
		rulePending?: boolean;
	} = $props();

	let profileDialogOpen = $state(false);
	let ruleDialogOpen = $state(false);

	function getRuleSummary(profileId: string) {
		return pricing?.profileRuleSummaries.find(
			(summary) => summary.profileId === profileId
		);
	}

	async function handleCreatePricingProfile(input: {
		baseHourlyPriceCents: number;
		currency: string;
		isDefault?: boolean;
		listingId: string;
		minimumHours?: number;
		name: string;
		serviceFeeBps?: number;
		taxBps?: number;
	}) {
		const result = await onCreatePricingProfile?.(input);
		if (result !== false) {
			profileDialogOpen = false;
		}
	}

	async function handleCreatePricingRule(input: {
		adjustmentType: "flat_cents" | "percent";
		adjustmentValue: number;
		conditionJson: Record<string, unknown>;
		listingId: string;
		name: string;
		priority?: number;
		pricingProfileId: string;
		ruleType: string;
	}) {
		const result = await onCreatePricingRule?.(input);
		if (result !== false) {
			ruleDialogOpen = false;
		}
	}
</script>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Pricing workspace</CardTitle>
		<CardDescription>
			Profiles and pricing rules currently available to this listing.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		<div class="flex flex-wrap gap-2">
			{#if onCreatePricingProfile}
				<WorkspaceActionDialog
					bind:open={profileDialogOpen}
					triggerLabel="Add profile"
					title="Create pricing profile"
					description="Add the next operator-ready price profile without leaving the workspace."
				>
					{#snippet children()}
						<CreatePricingProfileForm
							{listingId}
							{pricing}
							onSubmit={handleCreatePricingProfile}
							{pending}
							{errorMessage}
							showIntro={false}
						/>
					{/snippet}
				</WorkspaceActionDialog>
			{/if}

			{#if onCreatePricingRule}
				<WorkspaceActionDialog
					bind:open={ruleDialogOpen}
					triggerLabel="Add rule"
					title="Add pricing rule"
					description="Create the next pricing adjustment on top of an existing profile."
					triggerDisabled={!pricing?.profiles.length}
				>
					{#snippet children()}
						<CreatePricingRuleForm
							{listingId}
							{pricing}
							onSubmit={handleCreatePricingRule}
							pending={rulePending}
							errorMessage={ruleErrorMessage}
							showIntro={false}
						/>
					{/snippet}
				</WorkspaceActionDialog>
			{/if}
		</div>

		<div class="grid gap-4 md:grid-cols-3">
			<div class="rounded-lg border p-3 text-sm">
				<p class="font-medium">Profiles</p>
				<p class="text-muted-foreground">{pricing?.profiles.length ?? 0}</p>
			</div>
			<div class="rounded-lg border p-3 text-sm">
				<p class="font-medium">Rules</p>
				<p class="text-muted-foreground">{pricing?.totalRuleCount ?? 0}</p>
			</div>
			<div class="rounded-lg border p-3 text-sm">
				<p class="font-medium">Active rules</p>
				<p class="text-muted-foreground">
					{pricing?.totalActiveRuleCount ?? 0}
				</p>
			</div>
		</div>
		{#if pricing?.profiles.length}
			<div class="space-y-3">
				{#each pricing.profiles as profile (profile.id)}
					<div class="rounded-lg border p-3">
						<div class="flex items-center justify-between gap-3">
							<div>
								<p class="font-medium">{profile.name}</p>
								<p class="text-sm text-muted-foreground">
									{profile.currency}
									· {profile.baseHourlyPriceCents} cents/hour
								</p>
							</div>
							{#if profile.isDefault}
								<Badge variant="outline">Default</Badge>
							{/if}
						</div>
						<p class="mt-2 text-sm text-muted-foreground">
							{getRuleSummary(profile.id)?.activeRuleCount ?? 0} active / {getRuleSummary(profile.id)?.totalRuleCount ??
								0} total rules
						</p>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No pricing profiles yet.</p>
		{/if}
	</CardContent>
</Card>
