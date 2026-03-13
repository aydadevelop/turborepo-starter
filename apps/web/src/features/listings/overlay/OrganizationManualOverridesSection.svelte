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
	import WorkspaceActionDialog from "../workspace/shared/WorkspaceActionDialog.svelte";
	import type { OrganizationOverlaySummary } from "$lib/orpc-types";
	import CreateManualOverrideForm from "./CreateManualOverrideForm.svelte";
	import type { OrganizationOverlayListingOption } from "./types";

	let {
		overlay,
		listingOptions = [],
		createPending = false,
		resolvePendingId = null,
		createError = null,
		onCreateManualOverride,
		onResolveManualOverride,
	}: {
		overlay: OrganizationOverlaySummary;
		listingOptions?: OrganizationOverlayListingOption[];
		createPending?: boolean;
		resolvePendingId?: string | null;
		createError?: string | null;
		onCreateManualOverride: (input: {
			scopeType: "organization" | "listing";
			scopeKey?: string | null;
			code: string;
			title: string;
			note?: string;
		}) => boolean | void | Promise<boolean | void>;
		onResolveManualOverride: (id: string) => boolean | void | Promise<boolean | void>;
	} = $props();

	let createDialogOpen = $state(false);

	async function handleCreateManualOverride(input: {
		scopeType: "organization" | "listing";
		scopeKey?: string | null;
		code: string;
		title: string;
		note?: string;
	}) {
		const result = await onCreateManualOverride(input);
		if (result !== false) {
			createDialogOpen = false;
		}
	}
</script>

<Card>
	<CardHeader class="gap-3">
		<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
			<div class="space-y-1">
				<CardTitle class="text-base">Manual overrides</CardTitle>
				<CardDescription>
					Use explicit override records for the 10% of cases that should not require code changes.
				</CardDescription>
			</div>
			<WorkspaceActionDialog
				bind:open={createDialogOpen}
				triggerLabel="Add override"
				title="Add manual override"
				description="Record the exceptional operator/admin case explicitly instead of burying it in notes."
			>
				{#snippet children()}
					<CreateManualOverrideForm
						{listingOptions}
						onSubmit={handleCreateManualOverride}
						pending={createPending}
						errorMessage={createError}
						showIntro={false}
					/>
				{/snippet}
			</WorkspaceActionDialog>
		</div>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if overlay.manualOverrides.items.length === 0}
			<p class="text-sm text-muted-foreground">No active manual overrides.</p>
		{:else}
			<div class="space-y-3">
				{#each overlay.manualOverrides.items as item (item.id)}
					<div class="rounded-lg border p-4">
						<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
							<div class="space-y-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="font-medium">{item.title}</p>
									<Badge variant="outline">{item.code}</Badge>
									<Badge variant="secondary">
										{item.scopeType === "organization" ? "Organization" : "Listing"}
									</Badge>
								</div>
								{#if item.note}
									<p class="text-sm text-muted-foreground">{item.note}</p>
								{/if}
								<p class="text-xs text-muted-foreground">
									Created {new Date(item.createdAt).toLocaleString()}
								</p>
							</div>
							<Button
								variant="outline"
								disabled={resolvePendingId === item.id}
								onclick={() => void onResolveManualOverride(item.id)}
							>
								{resolvePendingId === item.id ? "Resolving..." : "Resolve"}
							</Button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</CardContent>
</Card>
