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
	import CalendarAccountSourcesDialog from "./CalendarAccountSourcesDialog.svelte";

	import type { CalendarWorkspaceState } from "$lib/orpc-types";

	import type { ListingWorkspaceCalendarActions } from "../types";

	let {
		calendar = null,
		googleCalendarConnectUrl = null,
		onRefreshCalendarAccountSources = null,
		onAttachCalendarSource = null,
		onDetachConnection = null,
		refreshingAccountId = null,
		attachingSourceId = null,
		calendarActionErrorMessage = null,
		calendarNoticeMessage = null,
		calendarNoticeTone = "success",
	}: {
		calendar?: CalendarWorkspaceState | null;
	} & ListingWorkspaceCalendarActions = $props();

	const attachedSourceIds = $derived(
		new Set(
			(calendar?.connections ?? [])
				.map((connection) => connection.calendarSourceId)
				.filter((sourceId): sourceId is string => Boolean(sourceId))
		)
	);
	const sourceNameById = $derived(
		new Map((calendar?.sources ?? []).map((source) => [source.id, source.name]))
	);

	const ACCOUNT_STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary"> = {
		connected: "default",
		error: "destructive",
		disconnected: "secondary",
	};

	const SYNC_STATUS_LABEL: Record<string, string> = {
		idle: "Ready",
		syncing: "Syncing",
		error: "Error",
		disabled: "Disabled",
	};

	const SYNC_STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
		idle: "outline",
		syncing: "default",
		error: "destructive",
		disabled: "secondary",
	};
</script>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Calendar sync</CardTitle>
		<CardDescription>
			Connect provider accounts at the organization level, then attach
			calendars to this listing to block availability.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-6">
		<!-- Connect provider CTA -->
		<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
			<div class="space-y-1">
				<p class="text-sm font-medium">Connect provider account</p>
				<p class="text-sm text-muted-foreground">
					Connect Google once, then choose which discovered calendars block
					availability for this listing.
				</p>
			</div>
			{#if googleCalendarConnectUrl}
				<Button href={googleCalendarConnectUrl} type="button">
					Connect Google
				</Button>
			{/if}
		</div>


		<!-- Organization accounts -->
		<div class="space-y-3">
			<p class="text-sm font-semibold">Provider accounts</p>
			<p class="text-xs text-muted-foreground">
				Organization-level connections shared across all listings.
			</p>
			{#if calendar?.accounts.length}
				{#each calendar.accounts as account (account.id)}
					<div class="rounded-lg border p-3">
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0 space-y-0.5">
								<p class="truncate font-medium">
									{account.displayName ??
										account.accountEmail ??
										account.externalAccountId}
								</p>
								<div class="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
									<span>{account.provider}</span>
									{#if account.accountEmail}
										<span>·</span>
										<span class="truncate">{account.accountEmail}</span>
									{/if}
								</div>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								<Badge variant={ACCOUNT_STATUS_VARIANT[account.status] ?? "secondary"}>
									{account.status}
								</Badge>
							</div>
						</div>
						{#if account.lastError && account.status === "error"}
							<p class="mt-2 text-xs text-destructive">{account.lastError}</p>
						{/if}
						<div class="mt-3 flex flex-wrap items-center gap-2">
							<CalendarAccountSourcesDialog
								accountId={account.id}
								accountLabel={account.displayName ??
									account.accountEmail ??
									account.externalAccountId}
								sources={calendar.sources.filter((source) => source.calendarAccountId === account.id)}
								{attachedSourceIds}
								attachingSourceId={attachingSourceId}
								onRefreshCalendarAccountSources={onRefreshCalendarAccountSources}
								onAttachCalendarSource={onAttachCalendarSource}
								refreshing={refreshingAccountId === account.id}
							/>
						</div>
					</div>
				{/each}
			{:else}
				<p class="text-sm text-muted-foreground">
					No connected calendar accounts yet.
				</p>
			{/if}
		</div>

		<!-- Listing connections -->
		<div class="space-y-3">
			<p class="text-sm font-semibold">Listing connections</p>
			<p class="text-xs text-muted-foreground">
				Calendars attached to this listing for availability blocking.
			</p>
			{#if calendar?.connections.length}
				{#each calendar.connections as connection (connection.id)}
					<div class="rounded-lg border p-3">
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0 space-y-0.5">
								<p class="truncate font-medium">
									{sourceNameById.get(connection.calendarSourceId ?? "") ??
										connection.externalCalendarId ??
										connection.provider}
								</p>
								<p class="text-sm text-muted-foreground">
									{connection.provider}
								</p>
							</div>
							<div class="flex shrink-0 flex-wrap items-center gap-1.5">
								{#if !connection.isActive}
									<Badge variant="secondary">Inactive</Badge>
								{:else if connection.syncStatus === "error"}
									<Badge variant={SYNC_STATUS_VARIANT[connection.syncStatus]}>
										{SYNC_STATUS_LABEL[connection.syncStatus] ?? connection.syncStatus}
									</Badge>
								{/if}
								{#if onDetachConnection}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => onDetachConnection(connection.id)}
									>
										Detach
									</Button>
								{/if}
							</div>
						</div>
						{#if connection.lastError && connection.syncStatus === "error"}
							<p class="mt-2 text-xs text-destructive">{connection.lastError}</p>
						{/if}
					</div>
				{/each}
			{:else}
				<p class="text-sm text-muted-foreground">No calendar connections yet.</p>
			{/if}
		</div>

		<!-- Notices / errors -->
		{#if calendarNoticeMessage}
			<p
				class={calendarNoticeTone === "error"
					? "text-sm text-destructive"
					: "text-sm text-emerald-600"}
			>
				{calendarNoticeMessage}
			</p>
		{/if}
		{#if calendarActionErrorMessage}
			<p class="text-sm text-destructive">{calendarActionErrorMessage}</p>
		{/if}
	</CardContent>
</Card>
