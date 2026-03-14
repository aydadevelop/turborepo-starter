<script lang="ts" generics="TData extends RowData">
	import { Input } from "@my-app/ui/components/input";
	import type { Snippet } from "svelte";
	import type {
		DataTablePagination,
		DataTableSearch,
	} from "./data-table-state.svelte";
	import ResourceTable from "./ResourceTable.svelte";
	import ResourceTablePagination from "./ResourceTablePagination.svelte";
	import type { ResourceTableRowAttributes } from "./resource-table";
	import { type ColumnDef, type RowData } from "./resource-table";

	// DataTable — complete widget: search + table + pagination.
	// Wraps ResourceTable + ResourceTablePagination with DataTableState.
	// Pass `pagination` and/or `search` to enable those features.
	let {
		data,
		columns,
		getRowId = undefined,
		getRowAttributes = undefined,
		loading = false,
		loadingMessage = "Loading...",
		errorMessage = null,
		emptyMessage = "No results found.",
		search = undefined,
		searchPlaceholder = "Search...",
		pagination = undefined,
		itemLabel = "items",
		toolbar,
		class: className = "",
	}: {
		data: TData[];
		columns: ColumnDef<TData>[];
		getRowId?: ((originalRow: TData, index: number) => string) | undefined;
		getRowAttributes?: ((row: TData) => ResourceTableRowAttributes) | undefined;
		loading?: boolean;
		loadingMessage?: string;
		errorMessage?: string | null;
		emptyMessage?: string;
		search?: DataTableSearch;
		searchPlaceholder?: string;
		pagination?: DataTablePagination;
		itemLabel?: string;
		toolbar?: Snippet;
		class?: string;
	} = $props();
</script>

<div class="space-y-4 {className}">
	{#if search || toolbar}
		<div class="flex flex-wrap items-center gap-2">
			{#if search}
				<Input
					placeholder={searchPlaceholder}
					value={search.value}
					oninput={(e) => search!.set((e.target as HTMLInputElement).value)}
					class="max-w-sm"
				/>
			{/if}
			{#if toolbar}
				{@render toolbar()}
			{/if}
		</div>
	{/if}

	<ResourceTable
		{data}
		{columns}
		{getRowId}
		{getRowAttributes}
		{loading}
		{loadingMessage}
		{errorMessage}
		{emptyMessage}
	/>

	{#if pagination && pagination.totalPages > 1}
		<ResourceTablePagination
			currentPage={pagination.currentPage}
			totalPages={pagination.totalPages}
			totalItems={pagination.totalItems}
			{itemLabel}
			previousDisabled={!pagination.hasPrevious}
			nextDisabled={!pagination.hasNext}
			onPrevious={() => pagination!.previous()}
			onNext={() => pagination!.next()}
		/>
	{/if}
</div>
