<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { resolve } from "$app/paths";
	import DataTable from "../../../../components/operator/DataTable.svelte";
	import { createDataTableState } from "../../../../components/operator/data-table-state.svelte";
	import ResourceBadgeCell from "../../../../components/operator/ResourceBadgeCell.svelte";
	import ResourceLinkCell from "../../../../components/operator/ResourceLinkCell.svelte";
	import {
		createColumnHelper,
		renderComponent,
		type ColumnDef,
	} from "../../../../components/operator/resource-table";
	import SurfaceCard from "../../../../components/operator/SurfaceCard.svelte";
	import Text from "../../../../components/operator/Text.svelte";
	import { orpc } from "$lib/orpc";

	const table = createDataTableState({ limit: 20 });

	const orgsQuery = createQuery(() =>
		orpc.admin.organizations.listOrgs.queryOptions({
			input: {
				limit: table.pagination.limit,
				offset: table.pagination.offset,
				search: table.search.value || undefined,
			},
		})
	);

	$effect(() => {
		table.pagination.totalItems = orgsQuery.data?.total ?? 0;
	});

	type OrganizationRow = {
		id: string;
		name: string;
		slug: string;
		logo: string | null;
		metadata: string | null;
		createdAt: Date;
	};

	const columnHelper = createColumnHelper<OrganizationRow>();

	const columns: ColumnDef<OrganizationRow, any>[] = [
		columnHelper.accessor("name", {
			header: "Name",
			meta: {
				cellClass: "font-medium",
			},
		}),
		columnHelper.display({
			id: "slug",
			header: "Slug",
			cell: ({ row }) =>
				renderComponent(ResourceBadgeCell, {
					label: row.original.slug,
					variant: "secondary",
				}),
		}),
		columnHelper.accessor(
			(org) => new Date(org.createdAt).toLocaleDateString(),
			{
				id: "createdAt",
				header: "Created",
				meta: {
					cellClass: "text-muted-foreground text-sm",
				},
			}
		),
		columnHelper.display({
			id: "actions",
			header: "Actions",
			meta: {
				headerClass: "w-24",
			},
			cell: ({ row }) =>
				renderComponent(ResourceLinkCell, {
					href: resolve(`/admin/organizations/${row.original.id}`),
					label: "View",
				}),
		}),
	];
</script>

<div class="space-y-4">
	<Text variant="heading" as="h2">Organizations</Text>

	<SurfaceCard title="Organization list" contentClass="pt-0">
		{#snippet children()}
			<DataTable
				data={(orgsQuery.data?.items ?? []) as OrganizationRow[]}
				{columns}
				getRowId={(org) => org.id}
				loading={orgsQuery.isPending}
				errorMessage={orgsQuery.isError
					? "Failed to load organizations."
					: null}
				emptyMessage="No organizations found."
				search={table.search}
				searchPlaceholder="Search by name or slug..."
				pagination={table.pagination}
				itemLabel="organizations"
			/>
		{/snippet}
	</SurfaceCard>
</div>
