<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { createQuery } from "@tanstack/svelte-query";
	import { resolve } from "$app/paths";
	import { authClient } from "$lib/auth-client";
	import { orpc } from "$lib/orpc";
	import DataTable from "../../../../components/operator/DataTable.svelte";
	import { createDataTableState } from "../../../../components/operator/data-table-state.svelte";
	import ResourceBadgeCell from "../../../../components/operator/ResourceBadgeCell.svelte";
	import {
		type ColumnDef,
		createColumnHelper,
		renderComponent,
	} from "../../../../components/operator/resource-table";
	import SurfaceCard from "../../../../components/operator/SurfaceCard.svelte";
	import Text from "../../../../components/operator/Text.svelte";
	import AdminUserActionsCell from "./AdminUserActionsCell.svelte";

	let impersonating = $state(false);

	const handleImpersonate = async (userId: string) => {
		impersonating = true;
		const { error } = await authClient.admin.impersonateUser({ userId });
		impersonating = false;
		if (error) return;
		window.location.href = resolve("/dashboard/settings");
	};

	const table = createDataTableState({ limit: 20 });

	let roleFilter = $state("");
	let bannedFilter = $state<boolean | undefined>(undefined);

	const usersQuery = createQuery(() =>
		orpc.admin.organizations.listUsers.queryOptions({
			input: {
				limit: table.pagination.limit,
				offset: table.pagination.offset,
				search: table.search.value || undefined,
				role: roleFilter || undefined,
				banned: bannedFilter,
			},
		})
	);

	$effect(() => {
		table.pagination.totalItems = usersQuery.data?.total ?? 0;
	});

	type UserRow = {
		id: string;
		name: string | null;
		email: string;
		role?: string | null;
		banned?: boolean | null;
		organizationCount: number;
	};

	const columnHelper = createColumnHelper<UserRow>();

	const columns: ColumnDef<UserRow, unknown>[] = [
		columnHelper.accessor("name", {
			header: "Name",
			meta: {
				cellClass: "font-medium",
			},
		}),
		columnHelper.accessor("email", {
			header: "Email",
			meta: {
				cellClass: "text-muted-foreground",
			},
		}),
		columnHelper.display({
			id: "role",
			header: "Role",
			cell: ({ row }) =>
				renderComponent(ResourceBadgeCell, {
					label: row.original.role ?? "user",
					variant: row.original.role === "admin" ? "default" : "secondary",
				}),
		}),
		columnHelper.accessor("organizationCount", {
			header: "Orgs",
		}),
		columnHelper.display({
			id: "status",
			header: "Status",
			cell: ({ row }) =>
				renderComponent(ResourceBadgeCell, {
					label: row.original.banned ? "Banned" : "Active",
					variant: row.original.banned ? "destructive" : "outline",
				}),
		}),
		columnHelper.display({
			id: "actions",
			header: "Actions",
			meta: {
				headerClass: "w-24",
			},
			cell: ({ row }) =>
				row.original.role === "admin"
					? null : renderComponent(AdminUserActionsCell, {
							pending: impersonating,
							dataTestId: `impersonate-user-${row.original.id}`,
							onImpersonate: () => {
								handleImpersonate(row.original.id);
							},
						}),
		}),
	];
</script>

<div class="space-y-4">
	<Text variant="heading" as="h2" data-testid="admin-users-heading">Users</Text>

	<SurfaceCard title="User directory" contentClass="pt-0">
		{#snippet children()}
			<DataTable
				data={(usersQuery.data?.items ?? []) as UserRow[]}
				{columns}
				getRowId={(user) => user.id}
				getRowAttributes={(user) => ({
					"data-testid": `admin-user-row-${user.id}`,
				})}
				loading={usersQuery.isPending}
				errorMessage={usersQuery.isError ? "Failed to load users." : null}
				emptyMessage="No users found."
				search={table.search}
				searchPlaceholder="Search by name or email..."
				pagination={table.pagination}
				itemLabel="users"
			>
				{#snippet toolbar()}
					<Button
						variant={bannedFilter === true ? "destructive" : "outline"}
						size="sm"
						onclick={() => {
							bannedFilter = bannedFilter === true ? undefined : true;
							table.pagination.reset();
						}}
					>
						Banned
					</Button>
					<Button
						variant={roleFilter === "admin" ? "default" : "outline"}
						size="sm"
						onclick={() => {
							roleFilter = roleFilter === "admin" ? "" : "admin";
							table.pagination.reset();
						}}
					>
						Admins
					</Button>
				{/snippet}
			</DataTable>
		{/snippet}
	</SurfaceCard>
</div>
