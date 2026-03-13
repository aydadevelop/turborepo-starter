<script lang="ts" generics="TData extends RowData">
	import { cn } from "@my-app/ui/lib/utils";
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow,
	} from "@my-app/ui/components/table";
	import type { Snippet } from "svelte";
	import type {
		ResourceTableColumnMeta,
		ResourceTableRowAttributes,
	} from "./resource-table";
	import {
		createTable,
		getCoreRowModel,
		isRenderedComponent,
		type ColumnDef,
		type RowData,
	} from "./resource-table";

	let {
		data,
		columns,
		getRowId = undefined,
		getRowAttributes = undefined,
		loading = false,
		loadingMessage = "Loading...",
		errorMessage = null,
		emptyMessage = "No results found.",
		toolbar,
		footer,
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
		toolbar?: Snippet;
		footer?: Snippet;
		class?: string;
	} = $props();

	const table = $derived.by(() =>
		createTable<TData>({
			data,
			columns,
			getRowId,
			state: {
				columnPinning: {
					left: [],
					right: [],
				},
			},
			onStateChange: () => {},
			renderFallbackValue: null,
			getCoreRowModel: getCoreRowModel(),
		})
	);

	const columnCount = $derived(Math.max(table.getAllLeafColumns().length, 1));

	const resolveMeta = (meta: unknown) =>
		meta as ResourceTableColumnMeta | undefined;

	const getAlignmentClass = (align?: ResourceTableColumnMeta["align"]) => {
		if (align === "center") return "text-center";
		if (align === "right") return "text-right";
		return undefined;
	};

	const renderContent = (renderer: unknown, context: unknown) => {
		if (renderer == null) return null;
		if (typeof renderer === "function") {
			return renderer(context);
		}
		return renderer;
	};

	const renderHeader = (header: ReturnType<typeof table.getHeaderGroups>[number]["headers"][number]) =>
		renderContent(header.column.columnDef.header, header.getContext());

	const renderCell = (cell: ReturnType<typeof table.getRowModel>["rows"][number]["getVisibleCells"] extends () => infer TCells
		? TCells extends Array<infer TCell>
			? TCell
			: never
		: never) => {
		const renderer =
			cell.column.columnDef.cell ?? ((context: typeof cell.getContext extends () => infer TContext ? TContext : never) => context.getValue());

		return renderContent(renderer, cell.getContext());
	};

	const isPrimitiveRenderable = (
		value: unknown
	): value is string | number => typeof value === "string" || typeof value === "number";

	const hasRenderableContent = (value: unknown) =>
		value !== null && value !== undefined && value !== false;
</script>

<div class={cn("space-y-4", className)}>
	{#if toolbar}
		<div>{@render toolbar()}</div>
	{/if}

	<Table>
		<TableHeader>
			{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<TableRow>
					{#each headerGroup.headers as header (header.id)}
						{@const meta = resolveMeta(header.column.columnDef.meta)}
						<TableHead
							class={cn(meta?.headerClass, getAlignmentClass(meta?.align))}
						>
							{#if !header.isPlaceholder}
								{@const headerContent = renderHeader(header)}
								{#if isRenderedComponent(headerContent)}
									{@const Renderer = headerContent.component}
									<Renderer {...headerContent.props} />
								{:else if hasRenderableContent(headerContent)}
									{headerContent}
								{/if}
							{/if}
						</TableHead>
					{/each}
				</TableRow>
			{/each}
		</TableHeader>

		<TableBody>
			{#if loading}
				<TableRow>
					<TableCell colspan={columnCount} class="text-center text-muted-foreground">
						{loadingMessage}
					</TableCell>
				</TableRow>
			{:else if errorMessage}
				<TableRow>
					<TableCell colspan={columnCount} class="text-center text-destructive">
						{errorMessage}
					</TableCell>
				</TableRow>
			{:else if table.getRowModel().rows.length === 0}
				<TableRow>
					<TableCell colspan={columnCount} class="text-center text-muted-foreground">
						{emptyMessage}
					</TableCell>
				</TableRow>
			{:else}
				{#each table.getRowModel().rows as row (row.id)}
					<TableRow {...(getRowAttributes?.(row.original) ?? {})}>
						{#each row.getVisibleCells() as cell (cell.id)}
							{@const meta = resolveMeta(cell.column.columnDef.meta)}
							{@const cellContent = renderCell(cell)}
							<TableCell
								class={cn(meta?.cellClass, getAlignmentClass(meta?.align))}
							>
								{#if isRenderedComponent(cellContent)}
									{@const Renderer = cellContent.component}
									<Renderer {...cellContent.props} />
								{:else if isPrimitiveRenderable(cellContent)}
									{cellContent}
								{:else if hasRenderableContent(cellContent)}
									{String(cellContent)}
								{/if}
							</TableCell>
						{/each}
					</TableRow>
				{/each}
			{/if}
		</TableBody>
	</Table>

	{#if footer}
		<div>{@render footer()}</div>
	{/if}
</div>
