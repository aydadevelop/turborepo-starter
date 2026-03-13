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
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
	} from "@my-app/ui/components/dialog";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	import type { CalendarOrgWorkspaceState } from "$lib/orpc-types";
	import { orpc, queryClient } from "$lib/orpc";
	import { resolveServerPath } from "$lib/server-url";

	const stateQuery = createQuery(() =>
		orpc.calendar.getOrgWorkspaceState.queryOptions({ input: {} })
	);

	const listingsQuery = createQuery(() =>
		orpc.listing.list.queryOptions({
			input: { limit: 100 },
		})
	);

	const disconnectAccountMutation = createMutation(() =>
		orpc.calendar.disconnectAccount.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.calendar.key() });
			},
		})
	);

	const disconnectConnectionMutation = createMutation(() =>
		orpc.calendar.disconnect.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.calendar.key() });
			},
		})
	);

	const attachSourceMutation = createMutation(() =>
		orpc.calendar.attachSource.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.calendar.key() });
			},
		})
	);

	const setSourceVisibilityMutation = createMutation(() =>
		orpc.calendar.setSourceVisibility.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.calendar.key() });
			},
		})
	);

	const googleCalendarConnectUrl = $derived(
		`${resolveServerPath("/api/calendar/oauth/google/start")}?returnTo=${encodeURIComponent(page.url.pathname)}`
	);

	const ACCOUNT_STATUS_VARIANT: Record<
		string,
		"default" | "destructive" | "secondary"
	> = {
		connected: "default",
		error: "destructive",
		disconnected: "secondary",
	};

	type OrgConnection = CalendarOrgWorkspaceState["connections"][number];

	// --- Source visibility ---
	let showHiddenSources = $state(false);

	const visibleSources = $derived(
		(stateQuery.data?.sources ?? []).filter((s) => !s.isHidden)
	);
	const hiddenSources = $derived(
		(stateQuery.data?.sources ?? []).filter((s) => s.isHidden)
	);

	// --- Disconnect confirmation state ---
	let disconnectDialogOpen = $state(false);
	let confirmDisconnectAccountId = $state<string | null>(null);
	let confirmDisconnectAccountLabel = $state<string>("");

	function openDisconnectDialog(accountId: string, label: string) {
		confirmDisconnectAccountId = accountId;
		confirmDisconnectAccountLabel = label;
		disconnectDialogOpen = true;
	}

	async function confirmDisconnect() {
		if (!confirmDisconnectAccountId) return;
		await disconnectAccountMutation.mutateAsync({
			accountId: confirmDisconnectAccountId,
		});
		disconnectDialogOpen = false;
		confirmDisconnectAccountId = null;
	}

	// --- Source → listing attachment helpers ---
	const sourceAttachmentsById = $derived.by(() => {
		const connections = stateQuery.data?.connections ?? [];
		const map = new Map<string, OrgConnection[]>();
		for (const c of connections) {
			if (!c.calendarSourceId) continue;
			const arr = map.get(c.calendarSourceId) ?? [];
			arr.push(c);
			map.set(c.calendarSourceId, arr);
		}
		return map;
	});

	const connectionsByListing = $derived.by(() => {
		const connections = stateQuery.data?.connections ?? [];
		const grouped = new Map<string, { listingName: string | null; connections: OrgConnection[] }>();
		for (const c of connections) {
			const entry = grouped.get(c.listingId) ?? {
				listingName: c.listingName,
				connections: [],
			};
			entry.connections.push(c);
			grouped.set(c.listingId, entry);
		}
		return grouped;
	});

	const sourceNameById = $derived(
		new Map(
			(stateQuery.data?.sources ?? []).map((s) => [s.id, s.name])
		)
	);

	const listingOptions = $derived(
		(listingsQuery.data?.items ?? []).map((l) => ({
			id: l.id,
			name: l.name,
		}))
	);

	// --- Attach source to listing ---
	let attachDialogOpen = $state(false);
	let attachSourceId = $state<string | null>(null);
	let attachListingId = $state<string>("");

	function handleAttachSource(sourceId: string) {
		attachSourceId = sourceId;
		attachListingId = listingOptions[0]?.id ?? "";
		attachDialogOpen = true;
	}

	async function confirmAttachSource() {
		if (!attachSourceId || !attachListingId) return;
		await attachSourceMutation.mutateAsync({
			sourceId: attachSourceId,
			listingId: attachListingId,
		});
		attachDialogOpen = false;
		attachSourceId = null;
		attachListingId = "";
	}
</script>

<div class="space-y-6">
	{#if stateQuery.isPending}
		<p class="text-sm text-muted-foreground">Loading calendar workspace…</p>
	{:else if stateQuery.isError}
		<p class="text-sm text-destructive">
			Failed to load calendar workspace.
		</p>
	{:else}
		<!-- Connect provider CTA -->
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Connect a calendar provider</CardTitle>
				<CardDescription>
					Link your Google account to discover calendars, then attach them to
					listings to block availability.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex flex-wrap items-center gap-3">
					<Button href={googleCalendarConnectUrl} type="button">
						Connect Google
					</Button>
				</div>
			</CardContent>
		</Card>

		<!-- Provider accounts -->
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Provider accounts</CardTitle>
				<CardDescription>
					Organization-level calendar provider connections.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if stateQuery.data.accounts.length}
					{#each stateQuery.data.accounts as account (account.id)}
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
									<Button
										variant="ghost"
										size="sm"
										disabled={disconnectAccountMutation.isPending}
										onclick={() => {
											openDisconnectDialog(
												account.id,
												account.displayName ??
													account.accountEmail ??
													account.externalAccountId,
											);
										}}
									>
										Disconnect
									</Button>
								</div>
							</div>
							{#if account.lastError && account.status === "error"}
								<p class="mt-2 text-xs text-destructive">{account.lastError}</p>
							{/if}
						</div>
					{/each}
				{:else}
					<p class="text-sm text-muted-foreground">
						No connected calendar accounts yet.
					</p>
				{/if}
			</CardContent>
		</Card>

		<!-- Discovered sources with attachment info -->
		<Card>
			<CardHeader>
				<div class="flex items-center justify-between">
					<div class="space-y-1.5">
						<CardTitle class="text-base">Discovered calendars</CardTitle>
						<CardDescription>
							Calendars discovered from your connected accounts. Hide the ones
							you don't need, and attach the relevant ones to listings.
						</CardDescription>
					</div>
					{#if hiddenSources.length > 0}
						<Button
							variant="ghost"
							size="sm"
							onclick={() => (showHiddenSources = !showHiddenSources)}
						>
							{showHiddenSources ? "Hide hidden" : `Show ${hiddenSources.length} hidden`}
						</Button>
					{/if}
				</div>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if visibleSources.length || (showHiddenSources && hiddenSources.length)}
					{#each visibleSources as source (source.id)}
						{@const attachments = sourceAttachmentsById.get(source.id) ?? []}
						<div class="rounded-lg border p-3">
							<div class="flex items-center justify-between gap-3">
								<div class="min-w-0 space-y-0.5">
									<p class="truncate font-medium">{source.name}</p>
									<p class="truncate text-sm text-muted-foreground">
										{source.provider} · {source.externalCalendarId}
									</p>
								</div>
								<div class="flex shrink-0 items-center gap-1.5">
									{#if source.isPrimary}
										<Badge variant="default">Primary</Badge>
									{/if}
									<Button
										variant="outline"
										size="sm"
										disabled={attachSourceMutation.isPending}
										onclick={() => handleAttachSource(source.id)}
									>
										{attachments.length > 0 ? "Attach to another listing" : "Attach to listing"}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={setSourceVisibilityMutation.isPending}
										onclick={() =>
											setSourceVisibilityMutation.mutate({
												sourceId: source.id,
												isHidden: true,
											})}
									>
										Hide
									</Button>
								</div>
							</div>
							{#if attachments.length > 0}
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#each attachments as att (att.id)}
										<Badge variant="secondary" class="gap-1">
											{att.listingName ?? att.listingId}
											<button
												type="button"
												class="ml-0.5 hover:text-destructive"
												disabled={disconnectConnectionMutation.isPending}
												onclick={() =>
													disconnectConnectionMutation.mutate({
														connectionId: att.id,
													})}
											>
												×
											</button>
										</Badge>
									{/each}
								</div>
							{/if}
						</div>
					{/each}

					{#if showHiddenSources && hiddenSources.length > 0}
						<div class="space-y-3 rounded-lg border border-dashed p-3">
							<p class="text-xs font-medium text-muted-foreground">Hidden calendars</p>
							{#each hiddenSources as source (source.id)}
								<div class="flex items-center justify-between gap-3 rounded-lg border p-3">
									<div class="min-w-0 space-y-0.5">
										<p class="truncate font-medium text-muted-foreground">{source.name}</p>
										<p class="truncate text-sm text-muted-foreground">
											{source.provider} · {source.externalCalendarId}
										</p>
									</div>
									<Button
										variant="ghost"
										size="sm"
										disabled={setSourceVisibilityMutation.isPending}
										onclick={() =>
											setSourceVisibilityMutation.mutate({
												sourceId: source.id,
												isHidden: false,
											})}
									>
										Show
									</Button>
								</div>
							{/each}
						</div>
					{/if}
				{:else if stateQuery.data?.sources.length && !visibleSources.length}
					<p class="text-sm text-muted-foreground">
						All calendars are hidden.
						<button
							type="button"
							class="underline hover:text-foreground"
							onclick={() => (showHiddenSources = true)}
						>
							Show hidden calendars
						</button>
					</p>
				{:else}
					<p class="text-sm text-muted-foreground">
						No calendars discovered yet. Connect a provider account first.
					</p>
				{/if}
			</CardContent>
		</Card>

		<!-- Connections by listing -->
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Calendar connections</CardTitle>
				<CardDescription>
					Calendars attached to listings across the organization.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-5">
				{#if connectionsByListing.size > 0}
					{#each [...connectionsByListing.entries()] as [listingId, group] (listingId)}
						<div class="space-y-2">
							<div class="flex items-center gap-2">
								<p class="text-sm font-semibold">
									{group.listingName ?? listingId}
								</p>
								<a
									href={resolve(`/org/listings/${listingId}`)}
									class="text-xs text-muted-foreground hover:text-foreground underline"
								>
									View listing
								</a>
							</div>
							{#each group.connections as connection (connection.id)}
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
											<Button
												variant="ghost"
												size="sm"
												disabled={disconnectConnectionMutation.isPending}
												onclick={() =>
													disconnectConnectionMutation.mutate({
														connectionId: connection.id,
													})}
											>
												Detach
											</Button>
										</div>
									</div>
									{#if connection.lastError && connection.syncStatus === "error"}
										<p class="mt-2 text-xs text-destructive">{connection.lastError}</p>
									{/if}
								</div>
							{/each}
						</div>
					{/each}
				{:else}
					<p class="text-sm text-muted-foreground">
						No calendars attached to any listing yet.
					</p>
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>

<!-- Disconnect account confirmation dialog -->
<Dialog bind:open={disconnectDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Disconnect calendar account?</DialogTitle>
			<DialogDescription>
				This will disconnect <strong>{confirmDisconnectAccountLabel}</strong> and
				remove all discovered calendars from this account. Existing listing
				connections will remain but stop syncing.
			</DialogDescription>
		</DialogHeader>
		<DialogFooter>
			<Button variant="outline" onclick={() => (disconnectDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="destructive"
				disabled={disconnectAccountMutation.isPending}
				onclick={confirmDisconnect}
			>
				Disconnect
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<!-- Attach source to listing dialog -->
<Dialog bind:open={attachDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Attach calendar to listing</DialogTitle>
			<DialogDescription>
				Choose a listing to attach this calendar source to. The listing's
				availability will be blocked by events from this calendar.
			</DialogDescription>
		</DialogHeader>
		{#if listingOptions.length > 0}
			<select
				class="w-full rounded-md border bg-background px-3 py-2 text-sm"
				bind:value={attachListingId}
			>
				{#each listingOptions as listing (listing.id)}
					<option value={listing.id}>{listing.name}</option>
				{/each}
			</select>
		{:else}
			<p class="text-sm text-muted-foreground">No listings found.</p>
		{/if}
		<DialogFooter>
			<Button variant="outline" onclick={() => (attachDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				disabled={attachSourceMutation.isPending || !attachListingId}
				onclick={confirmAttachSource}
			>
				Attach
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
