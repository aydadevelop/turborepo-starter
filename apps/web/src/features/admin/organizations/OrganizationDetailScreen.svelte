<script lang="ts">
	import * as Tabs from "@my-app/ui/components/tabs";
	import { createQuery } from "@tanstack/svelte-query";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { orpc } from "$lib/orpc";
	import ResourceBadgeCell from "../../../components/operator/ResourceBadgeCell.svelte";
	import ResourceTable from "../../../components/operator/ResourceTable.svelte";
	import {
		type ColumnDef,
		createColumnHelper,
		renderComponent,
	} from "../../../components/operator/resource-table";
	import SurfaceCard from "../../../components/operator/SurfaceCard.svelte";

	const orgId = $derived(page.params.id ?? "");

	const orgQuery = createQuery(() =>
		orpc.admin.organizations.getOrg.queryOptions({
			input: { id: orgId },
		})
	);

	const membersQuery = createQuery(() =>
		orpc.admin.organizations.listMembers.queryOptions({
			input: { organizationId: orgId, limit: 50 },
		})
	);

	const invitationsQuery = createQuery(() =>
		orpc.admin.organizations.listInvitations.queryOptions({
			input: { organizationId: orgId, limit: 50 },
		})
	);

	type MemberRow = NonNullable<typeof membersQuery.data>["items"][number];
	type InvitationRow = NonNullable<
		typeof invitationsQuery.data
	>["items"][number];

	const memberColumnHelper = createColumnHelper<MemberRow>();
	const invitationColumnHelper = createColumnHelper<InvitationRow>();

	const roleVariant = (role: string) => {
		switch (role) {
			case "org_owner":
			case "owner":
			case "org_admin":
			case "admin":
				return "default" as const;
			case "manager":
			case "agent":
				return "secondary" as const;
			default:
				return "outline" as const;
		}
	};

	const statusVariant = (status: string) =>
		status === "pending" ? ("outline" as const) : ("secondary" as const);

	const memberColumns: ColumnDef<MemberRow, unknown>[] = [
		memberColumnHelper.accessor((member) => member.userName ?? "—", {
			id: "userName",
			header: "User",
			meta: {
				cellClass: "font-medium",
			},
		}),
		memberColumnHelper.accessor((member) => member.userEmail ?? "—", {
			id: "userEmail",
			header: "Email",
			meta: {
				cellClass: "text-muted-foreground",
			},
		}),
		memberColumnHelper.display({
			id: "role",
			header: "Role",
			cell: ({ row }) =>
				renderComponent(ResourceBadgeCell, {
					label: row.original.role,
					variant: roleVariant(row.original.role),
				}),
		}),
		memberColumnHelper.accessor(
			(member) => new Date(member.createdAt).toLocaleDateString(),
			{
				id: "createdAt",
				header: "Joined",
				meta: {
					cellClass: "text-muted-foreground text-sm",
				},
			}
		),
	];

	const invitationColumns: ColumnDef<InvitationRow, unknown>[] = [
		invitationColumnHelper.accessor("email", {
			header: "Email",
			meta: {
				cellClass: "font-medium",
			},
		}),
		invitationColumnHelper.display({
			id: "role",
			header: "Role",
			cell: ({ row }) =>
				renderComponent(ResourceBadgeCell, {
					label: row.original.role ?? "member",
					variant: "secondary",
				}),
		}),
		invitationColumnHelper.display({
			id: "status",
			header: "Status",
			cell: ({ row }) =>
				renderComponent(ResourceBadgeCell, {
					label: row.original.status,
					variant: statusVariant(row.original.status),
				}),
		}),
		invitationColumnHelper.accessor(
			(invitation) => new Date(invitation.expiresAt).toLocaleDateString(),
			{
				id: "expiresAt",
				header: "Expires",
				meta: {
					cellClass: "text-muted-foreground text-sm",
				},
			}
		),
	];
</script>

<div class="space-y-4">
	{#if orgQuery.isPending}
		<p class="text-muted-foreground">Loading organization…</p>
	{:else if orgQuery.isError}
		<p class="text-destructive">Organization not found.</p>
	{:else if orgQuery.data}
		{@const org = orgQuery.data}
		<div class="space-y-2">
			<a
				href={resolve("/admin/organizations")}
				class="text-sm text-muted-foreground hover:text-foreground"
			>
				&larr; Organizations
			</a>
			<div class="space-y-1">
				<h2 class="text-xl font-semibold">{org.name}</h2>
				<div
					class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
				>
					<span>Slug: {org.slug}</span>
					<span>&middot;</span>
					<span>Created {new Date(org.createdAt).toLocaleDateString()}</span>
				</div>
			</div>
		</div>

		<Tabs.Root value="members" class="space-y-4">
			<Tabs.List>
				<Tabs.Trigger value="members">
					Members ({membersQuery.data?.total ?? "..."})
				</Tabs.Trigger>
				<Tabs.Trigger value="invitations">
					Invitations ({invitationsQuery.data?.total ?? "..."})
				</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="members">
				<SurfaceCard
					title="Organization members"
					description="Current membership inside this organization."
					contentClass="pt-0"
				>
					{#snippet children()}
						<ResourceTable
							data={membersQuery.data?.items ?? []}
							columns={memberColumns}
							getRowId={(member) => member.id}
							loading={membersQuery.isPending}
							errorMessage={membersQuery.isError
								? "Failed to load members."
								: null}
							emptyMessage="No members."
						/>
					{/snippet}
				</SurfaceCard>
			</Tabs.Content>

			<Tabs.Content value="invitations">
				<SurfaceCard
					title="Organization invitations"
					description="Pending and historical invites issued for this organization."
					contentClass="pt-0"
				>
					{#snippet children()}
						<ResourceTable
							data={invitationsQuery.data?.items ?? []}
							columns={invitationColumns}
							getRowId={(invitation) => invitation.id}
							loading={invitationsQuery.isPending}
							errorMessage={invitationsQuery.isError
								? "Failed to load invitations."
								: null}
							emptyMessage="No invitations."
						/>
					{/snippet}
				</SurfaceCard>
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</div>
