<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
import { Button } from "@my-app/ui/components/button";
import * as Card from "@my-app/ui/components/card";
import { Input } from "@my-app/ui/components/input";
import * as Table from "@my-app/ui/components/table";
import { createQuery } from "@tanstack/svelte-query";
import { derived, writable } from "svelte/store";
import { resolve } from "$app/paths";
import { authClient } from "$lib/auth-client";
import { orpc } from "$lib/orpc";

let impersonating = $state(false);

const handleImpersonate = async (userId: string) => {
	impersonating = true;
	const { error } = await authClient.admin.impersonateUser({ userId });
	impersonating = false;
	if (error) return;
	window.location.href = resolve("/dashboard/settings");
};

const search = writable("");
const roleFilter = writable("");
const bannedFilter = writable<boolean | undefined>(undefined);
const currentOffset = writable(0);
const limit = 20;

const usersQuery = createQuery(
	derived(
		[search, roleFilter, bannedFilter, currentOffset],
		([$search, $roleFilter, $bannedFilter, $currentOffset]) =>
			orpc.admin.organizations.listUsers.queryOptions({
				input: {
					limit,
					offset: $currentOffset,
					search: $search || undefined,
					role: $roleFilter || undefined,
					banned: $bannedFilter,
				},
			})
	)
);

const totalPages = $derived(
	Math.max(1, Math.ceil(($usersQuery.data?.total ?? 0) / limit))
);
const currentPage = $derived(Math.floor($currentOffset / limit) + 1);
</script>

<div class="space-y-4">
	<h2 class="text-xl font-semibold" data-testid="admin-users-heading">Users</h2>

	<div class="flex flex-wrap gap-2">
		<Input
			placeholder="Search by name or email..."
			value={$search}
			oninput={(e) => {
				search.set((e.target as HTMLInputElement).value);
				currentOffset.set(0);
			}}
			class="max-w-sm"
		/>
		<Button
			variant={$bannedFilter === true ? "destructive" : "outline"}
			size="sm"
			onclick={() => {
				bannedFilter.set($bannedFilter === true ? undefined : true);
				currentOffset.set(0);
			}}
		>
			Banned
		</Button>
		<Button
			variant={$roleFilter === "admin" ? "default" : "outline"}
			size="sm"
			onclick={() => {
				roleFilter.set($roleFilter === "admin" ? "" : "admin");
				currentOffset.set(0);
			}}
		>
			Admins
		</Button>
	</div>

	<Card.Root>
		<Card.Content class="p-0">
			{#if $usersQuery.isPending}
				<p class="p-4 text-sm text-muted-foreground">Loading...</p>
			{:else if $usersQuery.isError}
				<p class="p-4 text-sm text-destructive">Failed to load users.</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head>Email</Table.Head>
							<Table.Head>Role</Table.Head>
							<Table.Head>Orgs</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head class="w-24">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each $usersQuery.data?.items ?? [] as u (u.id)}
							<Table.Row data-testid={`admin-user-row-${u.id}`}>
								<Table.Cell class="font-medium">{u.name}</Table.Cell>
								<Table.Cell class="text-muted-foreground">{u.email}</Table.Cell>
								<Table.Cell>
									<Badge variant={u.role === "admin" ? "default" : "secondary"}>
										{u.role ?? "user"}
									</Badge>
								</Table.Cell>
								<Table.Cell>{u.organizationCount}</Table.Cell>
								<Table.Cell>
									{#if u.banned}
										<Badge variant="destructive">Banned</Badge>
									{:else}
										<Badge variant="outline">Active</Badge>
									{/if}
								</Table.Cell>
								<Table.Cell>
									{#if u.role !== "admin"}
										<Button
											variant="outline"
											size="sm"
											disabled={impersonating}
											data-testid={`impersonate-user-${u.id}`}
											onclick={() => void handleImpersonate(u.id)}
										>
											Impersonate
										</Button>
									{/if}
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell
									colspan={6}
									class="text-center text-muted-foreground"
								>
									No users found.
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
				Page {currentPage} of {totalPages} ({$usersQuery.data?.total ?? 0}
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
