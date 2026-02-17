<script lang="ts">
	import { Badge } from "@full-stack-cf-app/ui/components/badge";
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import * as Card from "@full-stack-cf-app/ui/components/card";
	import * as Dialog from "@full-stack-cf-app/ui/components/dialog";
	import { Input } from "@full-stack-cf-app/ui/components/input";
	import { Label } from "@full-stack-cf-app/ui/components/label";
	import * as Table from "@full-stack-cf-app/ui/components/table";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { orpc, queryClient } from "$lib/orpc";

	const search = writable("");
	const statusFilter = writable("");
	const pendingOnly = writable(false);
	const currentOffset = writable(0);
	const limit = 20;

	const boatsQuery = createQuery(
		derived(
			[search, statusFilter, pendingOnly, currentOffset],
			([$search, $statusFilter, $pendingOnly, $currentOffset]) =>
				orpc.admin.boats.list.queryOptions({
					input: {
						limit,
						offset: $currentOffset,
						search: $search || undefined,
						status:
							($statusFilter as
								| "draft"
								| "active"
								| "maintenance"
								| "inactive") || undefined,
						onlyPendingApproval: $pendingOnly,
					},
				})
		)
	);

	const approveMutation = createMutation(
		orpc.admin.boats.approveBoat.mutationOptions({
			onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
		})
	);

	const connectCalendarMutation = createMutation(
		orpc.admin.boats.connectCalendar.mutationOptions({
			onSuccess: () => {
				connectDialogOpen = false;
				connectCalendarId = "";
				connectBoatId = "";
				queryClient.invalidateQueries({ queryKey: ["admin"] });
			},
		})
	);

	const startWebhookMutation = createMutation(
		orpc.admin.boats.startWebhook.mutationOptions({
			onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
		})
	);

	const stopWebhookMutation = createMutation(
		orpc.admin.boats.stopWebhook.mutationOptions({
			onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
		})
	);

	let connectDialogOpen = $state(false);
	let connectBoatId = $state("");
	let connectBoatName = $state("");
	let connectCalendarId = $state("");

	const openConnectDialog = (boatId: string, boatName: string) => {
		connectBoatId = boatId;
		connectBoatName = boatName;
		connectCalendarId = "";
		connectDialogOpen = true;
	};

	const totalPages = $derived(
		Math.max(1, Math.ceil(($boatsQuery.data?.total ?? 0) / limit))
	);
	const currentPage = $derived(Math.floor($currentOffset / limit) + 1);
</script>

<div class="space-y-4">
	<h2 class="text-xl font-semibold">Boats</h2>

	<div class="flex flex-wrap gap-2">
		<Input
			placeholder="Search boats..."
			value={$search}
			oninput={(e) => {
				search.set((e.target as HTMLInputElement).value);
				currentOffset.set(0);
			}}
			class="max-w-sm"
		/>
		<Button
			variant={$pendingOnly ? "default" : "outline"}
			size="sm"
			onclick={() => {
				pendingOnly.update((v) => !v);
				currentOffset.set(0);
			}}
		>
			Pending Approval
		</Button>
		{#each ["active", "draft", "maintenance", "inactive"] as status (status)}
			<Button
				variant={$statusFilter === status ? "default" : "outline"}
				size="sm"
				onclick={() => {
					statusFilter.set($statusFilter === status ? "" : status);
					currentOffset.set(0);
				}}
			>
				{status}
			</Button>
		{/each}
	</div>

	<Card.Root>
		<Card.Content class="p-0">
			{#if $boatsQuery.isPending}
				<p class="p-4 text-sm text-muted-foreground">Loading...</p>
			{:else if $boatsQuery.isError}
				<p class="p-4 text-sm text-destructive">Failed to load boats.</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head>Organization</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Calendar</Table.Head>
							<Table.Head>Webhook</Table.Head>
							<Table.Head>Approved</Table.Head>
							<Table.Head class="w-28">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each $boatsQuery.data?.items ?? [] as b (b.id)}
							<Table.Row>
								<Table.Cell class="font-medium">{b.name}</Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{b.organizationName ?? "—"}
								</Table.Cell>
								<Table.Cell>
									<Badge
										variant={b.status === "active" ? "default" : "secondary"}
									>
										{b.status}
									</Badge>
								</Table.Cell>
								<Table.Cell>
									<div class="flex items-center gap-2">
										{#if b.calendarSyncStatus === "none"}
											<Badge variant="outline">No calendar</Badge>
										{:else if b.calendarSyncStatus === "error"}
											<Badge variant="destructive">
												{b.calendarCount} · Error
											</Badge>
										{:else if b.calendarSyncStatus === "syncing"}
											<Badge variant="secondary">
												{b.calendarCount} · Syncing
											</Badge>
										{:else if b.calendarSyncStatus === "disabled"}
											<Badge variant="outline">
												{b.calendarCount} · Disabled
											</Badge>
										{:else}
											<Badge variant="default">
												{b.calendarCount} connected
											</Badge>
										{/if}
										<Button
											variant="ghost"
											size="sm"
											onclick={() => openConnectDialog(b.id, b.name)}
										>
											+ Add
										</Button>
									</div>
								</Table.Cell>
								<Table.Cell>
									{#if b.calendarCount === 0}
										<span class="text-sm text-muted-foreground">—</span>
									{:else if b.webhookActiveCount === b.calendarCount}
										<div class="flex items-center gap-2">
											<Badge variant="default">Active</Badge>
											<Button
												variant="ghost"
												size="sm"
												disabled={$stopWebhookMutation.isPending}
												onclick={() =>
													$stopWebhookMutation.mutate({
														boatId: b.id,
													})}
											>
												Stop
											</Button>
										</div>
									{:else if b.webhookActiveCount > 0}
										<div class="flex items-center gap-2">
											<Badge variant="secondary">
												{b.webhookActiveCount}/{b.calendarCount}
											</Badge>
											<Button
												variant="ghost"
												size="sm"
												disabled={$startWebhookMutation.isPending}
												onclick={() =>
													$startWebhookMutation.mutate({
														boatId: b.id,
													})}
											>
												Start All
											</Button>
										</div>
									{:else}
										<div class="flex items-center gap-2">
											<Badge variant="destructive">Inactive</Badge>
											<Button
												variant="ghost"
												size="sm"
												disabled={$startWebhookMutation.isPending}
												onclick={() =>
													$startWebhookMutation.mutate({
														boatId: b.id,
													})}
											>
												Start
											</Button>
										</div>
									{/if}
								</Table.Cell>
								<Table.Cell>
									{#if b.approvedAt}
										<Badge>Approved</Badge>
									{:else}
										<Badge variant="outline">Pending</Badge>
									{/if}
								</Table.Cell>
								<Table.Cell>
									{#if !b.approvedAt}
										<Button
											variant="default"
											size="sm"
											disabled={$approveMutation.isPending}
											onclick={() =>
												$approveMutation.mutate({ boatId: b.id })}
										>
											Approve
										</Button>
									{:else}
										<span class="text-sm text-muted-foreground">—</span>
									{/if}
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell
									colspan={7}
									class="text-center text-muted-foreground"
								>
									No boats found.
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if totalPages > 1}
		<div class="flex items-center justify-between">
			<p class="text-sm text-muted-foreground">
				Page {currentPage} of {totalPages} ({$boatsQuery.data?.total ?? 0}
				total)
			</p>
			<div class="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={$currentOffset === 0}
					onclick={() => currentOffset.set(Math.max(0, $currentOffset - limit))}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={currentPage >= totalPages}
					onclick={() => currentOffset.set($currentOffset + limit)}
				>
					Next
				</Button>
			</div>
		</div>
	{/if}

	<Dialog.Root bind:open={connectDialogOpen}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Connect Calendar</Dialog.Title>
				<Dialog.Description>
					Connect a Google Calendar to <strong>{connectBoatName}</strong>.
				</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="calendarId">Google Calendar ID</Label>
					<Input
						id="calendarId"
						placeholder="abc123@group.calendar.google.com"
						bind:value={connectCalendarId}
					/>
				</div>
				{#if $connectCalendarMutation.isError}
					<p class="text-sm text-destructive">
						{$connectCalendarMutation.error?.message ?? "Failed to connect calendar."}
					</p>
				{/if}
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (connectDialogOpen = false)}>
					Cancel
				</Button>
				<Button
					disabled={!connectCalendarId.trim() || $connectCalendarMutation.isPending}
					onclick={() =>
						$connectCalendarMutation.mutate({
							boatId: connectBoatId,
							externalCalendarId: connectCalendarId.trim(),
						})}
				>
					{$connectCalendarMutation.isPending ? "Connecting..." : "Connect"}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
</div>
