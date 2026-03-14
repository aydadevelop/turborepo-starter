<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import type { AvailabilityWorkspaceState } from "$lib/orpc-types";
	import WorkspaceActionDialog from "../shared/WorkspaceActionDialog.svelte";
	import CreateAvailabilityBlockForm from "./CreateAvailabilityBlockForm.svelte";
	import CreateAvailabilityExceptionForm from "./CreateAvailabilityExceptionForm.svelte";
	import CreateAvailabilityRuleForm from "./CreateAvailabilityRuleForm.svelte";

	let {
		listingId,
		availability = null,
		onAddAvailabilityRule = null,
		pending = false,
		errorMessage = null,
		onAddAvailabilityBlock = null,
		blockPending = false,
		blockErrorMessage = null,
		onAddAvailabilityException = null,
		exceptionPending = false,
		exceptionErrorMessage = null,
	}: {
		availability?: AvailabilityWorkspaceState | null;
		blockErrorMessage?: string | null;
		blockPending?: boolean;
		errorMessage?: string | null;
		exceptionErrorMessage?: string | null;
		exceptionPending?: boolean;
		listingId: string;
		onAddAvailabilityBlock?:
			| ((input: {
					endsAt: string;
					listingId: string;
					reason?: string;
					startsAt: string;
			  }) => boolean | undefined | Promise<boolean | undefined>)
			| null;
		onAddAvailabilityException?:
			| ((input: {
					date: string;
					endMinute?: number;
					isAvailable: boolean;
					listingId: string;
					reason?: string;
					startMinute?: number;
			  }) => boolean | undefined | Promise<boolean | undefined>)
			| null;
		onAddAvailabilityRule?:
			| ((input: {
					dayOfWeek: number;
					endMinute: number;
					listingId: string;
					startMinute: number;
			  }) => boolean | undefined | Promise<boolean | undefined>)
			| null;
		pending?: boolean;
	} = $props();

	let ruleDialogOpen = $state(false);
	let blockDialogOpen = $state(false);
	let exceptionDialogOpen = $state(false);

	async function handleAddAvailabilityRule(input: {
		dayOfWeek: number;
		endMinute: number;
		listingId: string;
		startMinute: number;
	}) {
		const result = await onAddAvailabilityRule?.(input);
		if (result !== false) {
			ruleDialogOpen = false;
		}
	}

	async function handleAddAvailabilityBlock(input: {
		endsAt: string;
		listingId: string;
		reason?: string;
		startsAt: string;
	}) {
		const result = await onAddAvailabilityBlock?.(input);
		if (result !== false) {
			blockDialogOpen = false;
		}
	}

	async function handleAddAvailabilityException(input: {
		date: string;
		endMinute?: number;
		isAvailable: boolean;
		listingId: string;
		reason?: string;
		startMinute?: number;
	}) {
		const result = await onAddAvailabilityException?.(input);
		if (result !== false) {
			exceptionDialogOpen = false;
		}
	}
</script>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Availability workspace</CardTitle>
		<CardDescription>
			Recurring rules, blocks, and exceptions for this listing.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		<div class="flex flex-wrap gap-2">
			{#if onAddAvailabilityRule}
				<WorkspaceActionDialog
					bind:open={ruleDialogOpen}
					triggerLabel="Add recurring rule"
					title="Add recurring rule"
					description="Create the next recurring availability window without leaving the workspace."
				>
					{#snippet children()}
						<CreateAvailabilityRuleForm
							{listingId}
							onSubmit={handleAddAvailabilityRule}
							{pending}
							{errorMessage}
							showIntro={false}
						/>
					{/snippet}
				</WorkspaceActionDialog>
			{/if}

			{#if onAddAvailabilityBlock}
				<WorkspaceActionDialog
					bind:open={blockDialogOpen}
					triggerLabel="Add block"
					title="Add availability block"
					description="Block a date range for maintenance, private charters, or manual closures."
				>
					{#snippet children()}
						<CreateAvailabilityBlockForm
							{listingId}
							onSubmit={handleAddAvailabilityBlock}
							pending={blockPending}
							errorMessage={blockErrorMessage}
							showIntro={false}
						/>
					{/snippet}
				</WorkspaceActionDialog>
			{/if}

			{#if onAddAvailabilityException}
				<WorkspaceActionDialog
					bind:open={exceptionDialogOpen}
					triggerLabel="Add exception"
					title="Add availability exception"
					description="Mark one-off closures or partial-day overrides for a specific date."
				>
					{#snippet children()}
						<CreateAvailabilityExceptionForm
							{listingId}
							onSubmit={handleAddAvailabilityException}
							pending={exceptionPending}
							errorMessage={exceptionErrorMessage}
							showIntro={false}
						/>
					{/snippet}
				</WorkspaceActionDialog>
			{/if}
		</div>

		<div class="grid gap-4 md:grid-cols-3">
			<div class="rounded-lg border p-3 text-sm">
				<p class="font-medium">Rules</p>
				<p class="text-muted-foreground">
					{availability?.activeRuleCount ?? 0}
				</p>
			</div>
			<div class="rounded-lg border p-3 text-sm">
				<p class="font-medium">Blocks</p>
				<p class="text-muted-foreground">
					{availability?.activeBlockCount ?? 0}
				</p>
			</div>
			<div class="rounded-lg border p-3 text-sm">
				<p class="font-medium">Exceptions</p>
				<p class="text-muted-foreground">{availability?.exceptionCount ?? 0}</p>
			</div>
		</div>
		{#if availability?.rules.length}
			<div class="space-y-2">
				{#each availability.rules as rule (rule.id)}
					<div class="rounded-lg border p-3 text-sm text-muted-foreground">
						Day {rule.dayOfWeek}: {rule.startMinute}–{rule.endMinute}
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				No active recurring rules yet.
			</p>
		{/if}

		{#if availability?.blocks.length}
			<div class="space-y-2">
				<h4 class="text-sm font-medium">Current blocks</h4>
				{#each availability.blocks as block (block.id)}
					<div class="rounded-lg border p-3 text-sm text-muted-foreground">
						{block.startsAt}
						- {block.endsAt}
						{#if block.reason}
							<span> · {block.reason}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if availability?.exceptions.length}
			<div class="space-y-2">
				<h4 class="text-sm font-medium">Current exceptions</h4>
				{#each availability.exceptions as exception (exception.id)}
					<div class="rounded-lg border p-3 text-sm text-muted-foreground">
						{exception.date}
						{#if exception.isAvailable}
							<span>
								· available
								{exception.startMinute ?? 0}–{exception.endMinute ?? 0}
							</span>
						{:else}
							<span> · unavailable</span>
						{/if}
						{#if exception.reason}
							<span> · {exception.reason}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</CardContent>
</Card>
