<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import type { CalendarWorkspaceState } from "$lib/orpc-types";
	import WorkspaceActionDialog from "../shared/WorkspaceActionDialog.svelte";

	let {
		accountId,
		accountLabel,
		sources = [],
		attachedSourceIds = new Set<string>(),
		onRefreshCalendarAccountSources = null,
		onAttachCalendarSource = null,
		refreshing = false,
		attachingSourceId = null,
	}: {
		accountId: string;
		accountLabel: string;
		attachedSourceIds?: Set<string>;
		attachingSourceId?: string | null;
		onAttachCalendarSource?:
			| ((sourceId: string) => void | Promise<void>)
			| null;
		onRefreshCalendarAccountSources?:
			| ((accountId: string) => void | Promise<void>)
			| null;
		refreshing?: boolean;
		sources?: CalendarWorkspaceState["sources"];
	} = $props();

	let open = $state(false);
</script>

<WorkspaceActionDialog
	bind:open
	triggerLabel="Manage calendars"
	title="Manage discovered calendars"
	description={`Choose which calendars from ${accountLabel} block availability for this listing.`}
>
	{#snippet children()}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<p class="text-sm text-muted-foreground">
				Review discovered calendars, refresh the account, and attach active
				calendars to this listing.
			</p>
			{#if onRefreshCalendarAccountSources}
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={refreshing}
					onclick={() => onRefreshCalendarAccountSources(accountId)}
				>
					{refreshing ? "Refreshing..." : "Refresh calendars"}
				</Button>
			{/if}
		</div>

		{#if sources.length}
			<div class="space-y-2">
				{#each sources as source (source.id)}
					<div
						class="flex items-center justify-between gap-3 rounded-md border p-3"
					>
						<div class="space-y-1">
							<p class="text-sm font-medium">{source.name}</p>
							<p class="text-xs text-muted-foreground">
								{source.timezone ?? "No timezone"}
							</p>
						</div>
						<div class="flex flex-wrap items-center gap-2">
							{#if source.isPrimary}
								<Badge variant="outline">Primary</Badge>
							{/if}
							{#if source.isHidden}
								<Badge variant="secondary">Hidden</Badge>
							{/if}
							{#if !source.isActive}
								<Badge variant="secondary">Inactive</Badge>
							{/if}
							{#if attachedSourceIds.has(source.id)}
								<Badge variant="default">Attached</Badge>
							{:else if onAttachCalendarSource && source.isActive}
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={attachingSourceId === source.id}
									onclick={() => onAttachCalendarSource(source.id)}
								>
									{attachingSourceId === source.id ? "Attaching..." : "Attach"}
								</Button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No discovered calendars yet.</p>
		{/if}
	{/snippet}
</WorkspaceActionDialog>
