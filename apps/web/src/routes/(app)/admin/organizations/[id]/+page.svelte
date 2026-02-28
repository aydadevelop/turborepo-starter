<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
import * as Card from "@my-app/ui/components/card";
import * as Table from "@my-app/ui/components/table";
import * as Tabs from "@my-app/ui/components/tabs";
import { createQuery } from "@tanstack/svelte-query";
import { untrack } from "svelte";
import { writable } from "svelte/store";
import { resolve } from "$app/paths";
import { page } from "$app/state";
import { orpc } from "$lib/orpc";

const orgOpts = $derived.by(() => {
	const id = page.params.id ?? "";
	return orpc.admin.organizations.getOrg.queryOptions({ input: { id } });
});
const orgOptsStore = writable(untrack(() => orgOpts));
$effect(() => {
	orgOptsStore.set(orgOpts);
});
const orgQuery = createQuery(orgOptsStore);

const membersOpts = $derived.by(() => {
	const organizationId = page.params.id ?? "";
	return orpc.admin.organizations.listMembers.queryOptions({
		input: { organizationId, limit: 50 },
	});
});
const membersOptsStore = writable(untrack(() => membersOpts));
$effect(() => {
	membersOptsStore.set(membersOpts);
});
const membersQuery = createQuery(membersOptsStore);

const invitationsOpts = $derived.by(() => {
	const organizationId = page.params.id ?? "";
	return orpc.admin.organizations.listInvitations.queryOptions({
		input: { organizationId, limit: 50 },
	});
});
const invitationsOptsStore = writable(untrack(() => invitationsOpts));
$effect(() => {
	invitationsOptsStore.set(invitationsOpts);
});
const invitationsQuery = createQuery(invitationsOptsStore);

const roleColor = (role: string) => {
	switch (role) {
		case "org_owner":
		case "owner":
			return "default" as const;
		case "org_admin":
		case "admin":
			return "default" as const;
		case "manager":
			return "secondary" as const;
		case "agent":
			return "secondary" as const;
		default:
			return "outline" as const;
	}
};
</script>

<div class="space-y-4">
	{#if $orgQuery.isPending}
		<p class="text-muted-foreground">Loading...</p>
	{:else if $orgQuery.isError}
		<p class="text-destructive">Organization not found.</p>
	{:else if $orgQuery.data}
		{@const org = $orgQuery.data}
		<div>
			<a
				href={resolve("/admin/organizations")}
				class="text-sm text-muted-foreground hover:text-foreground"
			>
				&larr; Organizations
			</a>
			<h2 class="mt-2 text-xl font-semibold">{org.name}</h2>
			<p class="text-sm text-muted-foreground">
				Slug: {org.slug} &middot; Created:
				{new Date(org.createdAt).toLocaleDateString()}
			</p>
		</div>

		<Tabs.Root value="members">
			<Tabs.List>
				<Tabs.Trigger value="members">
					Members ({$membersQuery.data?.total ?? "..."})
				</Tabs.Trigger>
				<Tabs.Trigger value="invitations">
					Invitations ({$invitationsQuery.data?.total ?? "..."})
				</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="members">
				<Card.Root>
					<Card.Content class="p-0">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>User</Table.Head>
									<Table.Head>Email</Table.Head>
									<Table.Head>Role</Table.Head>
									<Table.Head>Joined</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each $membersQuery.data?.items ?? [] as m (m.id)}
									<Table.Row>
										<Table.Cell class="font-medium">
											{m.userName ?? "—"}
										</Table.Cell>
										<Table.Cell class="text-muted-foreground">
											{m.userEmail ?? "—"}
										</Table.Cell>
										<Table.Cell>
											<Badge variant={roleColor(m.role)}>{m.role}</Badge>
										</Table.Cell>
										<Table.Cell class="text-muted-foreground text-sm">
											{new Date(m.createdAt).toLocaleDateString()}
										</Table.Cell>
									</Table.Row>
								{:else}
									<Table.Row>
										<Table.Cell
											colspan={4}
											class="text-center text-muted-foreground"
										>
											No members.
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</Card.Content>
				</Card.Root>
			</Tabs.Content>

			<Tabs.Content value="invitations">
				<Card.Root>
					<Card.Content class="p-0">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>Email</Table.Head>
									<Table.Head>Role</Table.Head>
									<Table.Head>Status</Table.Head>
									<Table.Head>Expires</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each $invitationsQuery.data?.items ?? [] as inv (inv.id)}
									<Table.Row>
										<Table.Cell class="font-medium">{inv.email}</Table.Cell>
										<Table.Cell>
											<Badge variant="secondary">{inv.role ?? "member"}</Badge>
										</Table.Cell>
										<Table.Cell>
											<Badge
												variant={inv.status === "pending" ? "outline" : "secondary"}
											>
												{inv.status}
											</Badge>
										</Table.Cell>
										<Table.Cell class="text-muted-foreground text-sm">
											{new Date(inv.expiresAt).toLocaleDateString()}
										</Table.Cell>
									</Table.Row>
								{:else}
									<Table.Row>
										<Table.Cell
											colspan={4}
											class="text-center text-muted-foreground"
										>
											No invitations.
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</Card.Content>
				</Card.Root>
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</div>
