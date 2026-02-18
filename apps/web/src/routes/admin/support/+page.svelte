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
	const priorityFilter = writable("");
	const sourceFilter = writable("");
	const currentOffset = writable(0);
	const limit = 20;
	const statusOptions = [
		"open",
		"pending_customer",
		"pending_operator",
		"escalated",
		"resolved",
		"closed",
	] as const;
	const priorityOptions = ["low", "normal", "high", "urgent"] as const;
	const sourceOptions = [
		"manual",
		"web",
		"telegram",
		"avito",
		"email",
		"sputnik",
	] as const;

	const ticketsQuery = createQuery(
		derived(
			[search, statusFilter, priorityFilter, sourceFilter, currentOffset],
			([
				$search,
				$statusFilter,
				$priorityFilter,
				$sourceFilter,
				$currentOffset,
			]) =>
				orpc.admin.support.listTickets.queryOptions({
					input: {
						limit,
						offset: $currentOffset,
						search: $search || undefined,
						status: ($statusFilter || undefined) as
							| undefined
							| "open"
							| "pending_customer"
							| "pending_operator"
							| "escalated"
							| "resolved"
							| "closed",
						priority: ($priorityFilter || undefined) as
							| undefined
							| "low"
							| "normal"
							| "high"
							| "urgent",
						source: ($sourceFilter || undefined) as
							| undefined
							| "manual"
							| "web"
							| "telegram"
							| "avito"
							| "email"
							| "sputnik",
					} as const,
				})
		)
	);

	const totalPages = $derived(
		Math.max(1, Math.ceil(($ticketsQuery.data?.total ?? 0) / limit))
	);
	const currentPage = $derived(Math.floor($currentOffset / limit) + 1);

	const priorityColor = (p: string) => {
		switch (p) {
			case "urgent":
				return "destructive" as const;
			case "high":
				return "default" as const;
			default:
				return "secondary" as const;
		}
	};
</script>

<div class="space-y-4">
	<h2 class="text-xl font-semibold">Support Tickets</h2>

	<div class="flex flex-wrap gap-2">
		<Input
			placeholder="Search tickets..."
			value={$search}
			oninput={(e) => {
				search.set((e.target as HTMLInputElement).value);
				currentOffset.set(0);
			}}
			class="max-w-sm"
		/>
		<Button
			variant="outline"
			size="sm"
			disabled={!$statusFilter && !$priorityFilter && !$sourceFilter}
			onclick={() => {
				statusFilter.set("");
				priorityFilter.set("");
				sourceFilter.set("");
				currentOffset.set(0);
			}}
		>
			Clear filters
		</Button>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<span class="text-xs uppercase tracking-wide text-muted-foreground"
			>Status</span
		>
		{#each statusOptions as status (status)}
			<Button
				variant={$statusFilter === status ? "default" : "outline"}
				size="sm"
				onclick={() => {
					statusFilter.set($statusFilter === status ? "" : status);
					currentOffset.set(0);
				}}
			>
				{status.replace("_", " ")}
			</Button>
		{/each}
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<span class="text-xs uppercase tracking-wide text-muted-foreground"
			>Priority</span
		>
		{#each priorityOptions as priority (priority)}
			<Button
				variant={$priorityFilter === priority ? "default" : "outline"}
				size="sm"
				onclick={() => {
					priorityFilter.set($priorityFilter === priority ? "" : priority);
					currentOffset.set(0);
				}}
			>
				{priority}
			</Button>
		{/each}
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<span class="text-xs uppercase tracking-wide text-muted-foreground"
			>Source</span
		>
		{#each sourceOptions as source (source)}
			<Button
				variant={$sourceFilter === source ? "default" : "outline"}
				size="sm"
				onclick={() => {
					sourceFilter.set($sourceFilter === source ? "" : source);
					currentOffset.set(0);
				}}
			>
				{source}
			</Button>
		{/each}
	</div>

	<Card.Root>
		<Card.Content class="p-0">
			{#if $ticketsQuery.isPending}
				<p class="p-4 text-sm text-muted-foreground">Loading...</p>
			{:else if $ticketsQuery.isError}
				<p class="p-4 text-sm text-destructive">Failed to load tickets.</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Subject</Table.Head>
							<Table.Head>Organization</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Priority</Table.Head>
							<Table.Head>Assigned To</Table.Head>
							<Table.Head>Created</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each $ticketsQuery.data?.items ?? [] as t (t.id)}
							<Table.Row>
								<Table.Cell class="font-medium max-w-[200px] truncate">
									{t.subject}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{t.organizationName ?? "—"}
								</Table.Cell>
								<Table.Cell>
									<Badge
										variant={t.status === "open" ? "default" : "secondary"}
									>
										{t.status}
									</Badge>
								</Table.Cell>
								<Table.Cell>
									<Badge variant={priorityColor(t.priority)}>
										{t.priority}
									</Badge>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{t.assignedToName ?? "Unassigned"}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">
									{new Date(t.createdAt).toLocaleDateString()}
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell
									colspan={6}
									class="text-center text-muted-foreground"
								>
									No tickets found.
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
				Page {currentPage} of {totalPages} ({$ticketsQuery.data?.total ?? 0}
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
