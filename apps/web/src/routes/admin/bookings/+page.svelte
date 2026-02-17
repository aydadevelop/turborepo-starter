<script lang="ts">
	import { Badge } from "@full-stack-cf-app/ui/components/badge";
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import * as Card from "@full-stack-cf-app/ui/components/card";
	import { Input } from "@full-stack-cf-app/ui/components/input";
	import * as Table from "@full-stack-cf-app/ui/components/table";
	import { createQuery } from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { orpc } from "$lib/orpc";

	const search = writable("");
	const statusFilter = writable("");
	const currentOffset = writable(0);
	const limit = 20;

	const bookingsQuery = createQuery(
		derived(
			[search, statusFilter, currentOffset],
			([$search, $statusFilter, $currentOffset]) =>
				orpc.admin.bookings.list.queryOptions({
					input: {
						limit,
						offset: $currentOffset,
						search: $search || undefined,
						status: ($statusFilter || undefined) as
							| undefined
							| "pending"
							| "awaiting_payment"
							| "confirmed"
							| "in_progress"
							| "completed"
							| "cancelled"
							| "no_show",
					} as const,
				})
		)
	);

	const totalPages = $derived(
		Math.max(1, Math.ceil(($bookingsQuery.data?.total ?? 0) / limit))
	);
	const currentPage = $derived(Math.floor($currentOffset / limit) + 1);

	const formatMoney = (cents: number, currency: string) =>
		new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			maximumFractionDigits: 2,
		}).format(cents / 100);
</script>

<div class="space-y-4">
	<h2 class="text-xl font-semibold">Bookings</h2>

	<div class="flex flex-wrap gap-2">
		<Input
			placeholder="Search by contact name..."
			value={$search}
			oninput={(e) => {
				search.set((e.target as HTMLInputElement).value);
				currentOffset.set(0);
			}}
			class="max-w-sm"
		/>
		{#each ["confirmed", "pending", "cancelled", "completed"] as status (status)}
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
			{#if $bookingsQuery.isPending}
				<p class="p-4 text-sm text-muted-foreground">Loading...</p>
			{:else if $bookingsQuery.isError}
				<p class="p-4 text-sm text-destructive">Failed to load bookings.</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>ID</Table.Head>
							<Table.Head>Organization</Table.Head>
							<Table.Head>Boat</Table.Head>
							<Table.Head>Customer</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Total</Table.Head>
							<Table.Head>Date</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each $bookingsQuery.data?.items ?? [] as b (b.id)}
							<Table.Row>
								<Table.Cell class="font-mono text-xs">
									{b.id.slice(0, 8)}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{b.organizationName ?? "—"}
								</Table.Cell>
								<Table.Cell>{b.boatName ?? "—"}</Table.Cell>
								<Table.Cell>
									{b.customerName ?? b.contactName ?? "—"}
								</Table.Cell>
								<Table.Cell>
									<Badge
										variant={b.status === "confirmed"
											? "default"
											: b.status === "cancelled"
												? "destructive"
												: "secondary"}
									>
										{b.status}
									</Badge>
								</Table.Cell>
								<Table.Cell>
									{formatMoney(b.totalPriceCents, b.currency)}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">
									{new Date(b.startsAt).toLocaleDateString()}
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell
									colspan={7}
									class="text-center text-muted-foreground"
								>
									No bookings found.
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
				Page {currentPage} of {totalPages} ({$bookingsQuery.data?.total ?? 0}
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
