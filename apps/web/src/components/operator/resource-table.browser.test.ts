import { expect, test } from "vitest";
import { page } from "vitest/browser";
import type { Component } from "svelte";
import { renderComponent } from "../../test/browser/render";
import ResourceTable from "./ResourceTable.svelte";
import { type ColumnDef, createColumnHelper } from "./resource-table";

interface DemoRow {
	id: string;
	name: string;
	status: string;
}

interface DemoResourceTableProps {
	columns: ColumnDef<DemoRow>[];
	data: DemoRow[];
	emptyMessage?: string;
	getRowAttributes?: (row: DemoRow) => Record<string, string | undefined>;
	getRowId?: (row: DemoRow, index: number) => string;
	loading?: boolean;
}

const columnHelper = createColumnHelper<DemoRow>();

const TypedResourceTable =
	ResourceTable as unknown as Component<DemoResourceTableProps>;

const columns: ColumnDef<DemoRow, unknown>[] = [
	columnHelper.accessor("name", {
		header: "Name",
		meta: {
			cellClass: "font-medium",
		},
	}),
	columnHelper.accessor("status", {
		header: "Status",
	}),
];

const data: DemoRow[] = [
	{ id: "one", name: "Sea Explorer", status: "Active" },
	{ id: "two", name: "River Runner", status: "Draft" },
];

test("renders loading and empty states", async () => {
	renderComponent(TypedResourceTable, {
		data: [],
		columns,
		loading: true,
	});

	await expect.element(page.getByText("Loading...")).toBeInTheDocument();
});

test("renders the empty state when no rows are provided", async () => {
	renderComponent(TypedResourceTable, {
		data: [],
		columns,
		emptyMessage: "No resources found.",
	});

	await expect
		.element(page.getByText("No resources found."))
		.toBeInTheDocument();
});

test("renders rows through the shared table wrapper", async () => {
	renderComponent(TypedResourceTable, {
		data,
		columns,
		getRowId: (row: DemoRow) => row.id,
		getRowAttributes: (row: DemoRow) => ({
			"data-testid": `resource-row-${row.id}`,
		}),
	});

	await expect.element(page.getByText("Sea Explorer")).toBeInTheDocument();
	await expect.element(page.getByText("River Runner")).toBeInTheDocument();
	await expect
		.element(page.getByTestId("resource-row-one"))
		.toBeInTheDocument();
	await expect(document.body).toMatchScreenshot("resource-table-data");
});
