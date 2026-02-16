<script lang="ts">
	import { Badge } from "@full-stack-cf-app/ui/components/badge";
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import * as Card from "@full-stack-cf-app/ui/components/card";
	import { Input } from "@full-stack-cf-app/ui/components/input";
	import * as Table from "@full-stack-cf-app/ui/components/table";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { orpc, queryClient } from "$lib/orpc";

	const search = writable("");
	const statusFilter = writable("");
	const pendingOnly = writable(false);
	const currentOffset = writable(0);
	const limit = 20;

	const queryOptions = derived(
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
	);

	const boatsQuery = createQuery(queryOptions);

	const approveMutation = createMutation(
		orpc.admin.boats.approveBoat.mutationOptions({
			onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
		})
	);

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
									colspan={5}
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
</div>
