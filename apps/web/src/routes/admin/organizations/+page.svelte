<script lang="ts">
	import { Badge } from "@full-stack-cf-app/ui/components/badge";
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import * as Card from "@full-stack-cf-app/ui/components/card";
	import { Input } from "@full-stack-cf-app/ui/components/input";
	import * as Table from "@full-stack-cf-app/ui/components/table";
	import { createQuery } from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { resolve } from "$app/paths";
	import { orpc } from "$lib/orpc";

	const search = writable("");
	const currentOffset = writable(0);
	const limit = 20;

	const orgsQuery = createQuery(
		derived([search, currentOffset], ([$search, $currentOffset]) =>
			orpc.admin.organizations.listOrgs.queryOptions({
				input: { limit, offset: $currentOffset, search: $search || undefined },
			})
		)
	);

	const totalPages = $derived(
		Math.max(1, Math.ceil(($orgsQuery.data?.total ?? 0) / limit))
	);
	const currentPage = $derived(Math.floor($currentOffset / limit) + 1);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Organizations</h2>
	</div>

	<div class="flex gap-2">
		<Input
			placeholder="Search by name or slug..."
			value={$search}
			oninput={(e) => {
				search.set((e.target as HTMLInputElement).value);
				currentOffset.set(0);
			}}
			class="max-w-sm"
		/>
	</div>

	<Card.Root>
		<Card.Content class="p-0">
			{#if $orgsQuery.isPending}
				<p class="p-4 text-sm text-muted-foreground">Loading...</p>
			{:else if $orgsQuery.isError}
				<p class="p-4 text-sm text-destructive">
					Failed to load organizations.
				</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head>Slug</Table.Head>
							<Table.Head>Created</Table.Head>
							<Table.Head class="w-24">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each $orgsQuery.data?.items ?? [] as org (org.id)}
							<Table.Row>
								<Table.Cell class="font-medium">{org.name}</Table.Cell>
								<Table.Cell>
									<Badge variant="secondary">{org.slug}</Badge>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">
									{new Date(org.createdAt).toLocaleDateString()}
								</Table.Cell>
								<Table.Cell>
									<a
										href={resolve(`/admin/organizations/${org.id}`)}
										class="text-sm text-primary hover:underline"
									>
										View
									</a>
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell
									colspan={4}
									class="text-center text-muted-foreground"
								>
									No organizations found.
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
				Page {currentPage} of {totalPages} ({$orgsQuery.data?.total ?? 0} total)
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
