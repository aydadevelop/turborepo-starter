/**
 * Composable state for DataTable: pagination, search, and row selection.
 *
 * Usage:
 * ```ts
 * const table = createDataTableState({ limit: 20 });
 * // Pass table.offset, table.search to query input
 * // Bind table to <DataTable> via pagination/search/selection props
 * ```
 */

export interface DataTablePagination {
	readonly currentPage: number;
	readonly hasNext: boolean;
	readonly hasPrevious: boolean;
	readonly limit: number;
	next(): void;
	readonly offset: number;
	previous(): void;
	reset(): void;
	totalItems: number;
	readonly totalPages: number;
}

export interface DataTableSearch {
	clear(): void;
	set(value: string): void;
	readonly value: string;
}

export interface DataTableSelection<TId = string> {
	clear(): void;
	readonly count: number;
	deselect(id: TId): void;
	has(id: TId): boolean;
	select(id: TId): void;
	readonly selected: Set<TId>;
	toggle(id: TId): void;
	toggleAll(ids: TId[]): void;
}

export interface DataTableState<TId = string> {
	pagination: DataTablePagination;
	search: DataTableSearch;
	selection: DataTableSelection<TId>;
}

export function createDataTableState<TId = string>(options?: {
	limit?: number;
}): DataTableState<TId> {
	const limit = options?.limit ?? 20;

	// --- Pagination ---
	let offset = $state(0);
	let totalItems = $state(0);

	const currentPage = $derived(Math.floor(offset / limit) + 1);
	const totalPages = $derived(Math.max(1, Math.ceil(totalItems / limit)));
	const hasPrevious = $derived(offset > 0);
	const hasNext = $derived(currentPage < totalPages);

	const pagination: DataTablePagination = {
		get offset() {
			return offset;
		},
		get limit() {
			return limit;
		},
		get currentPage() {
			return currentPage;
		},
		get totalItems() {
			return totalItems;
		},
		set totalItems(value: number) {
			totalItems = value;
		},
		get totalPages() {
			return totalPages;
		},
		get hasPrevious() {
			return hasPrevious;
		},
		get hasNext() {
			return hasNext;
		},
		previous() {
			offset = Math.max(0, offset - limit);
		},
		next() {
			offset += limit;
		},
		reset() {
			offset = 0;
		},
	};

	// --- Search ---
	let searchValue = $state("");

	const search: DataTableSearch = {
		get value() {
			return searchValue;
		},
		set(value: string) {
			searchValue = value;
			offset = 0; // reset pagination on search
		},
		clear() {
			searchValue = "";
			offset = 0;
		},
	};

	// --- Selection ---
	let selected = $state(new Set<TId>());

	const selection: DataTableSelection<TId> = {
		get selected() {
			return selected;
		},
		get count() {
			return selected.size;
		},
		toggle(id: TId) {
			const next = new Set(selected);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			selected = next;
		},
		select(id: TId) {
			if (!selected.has(id)) {
				const next = new Set(selected);
				next.add(id);
				selected = next;
			}
		},
		deselect(id: TId) {
			if (selected.has(id)) {
				const next = new Set(selected);
				next.delete(id);
				selected = next;
			}
		},
		clear() {
			selected = new Set();
		},
		has(id: TId) {
			return selected.has(id);
		},
		toggleAll(ids: TId[]) {
			const allSelected = ids.every((id) => selected.has(id));
			if (allSelected) {
				selected = new Set();
			} else {
				selected = new Set(ids);
			}
		},
	};

	return { pagination, search, selection };
}
