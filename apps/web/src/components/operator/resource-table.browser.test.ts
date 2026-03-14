import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderComponent } from "../../test/browser/render";
import ResourceTable from "./ResourceTable.svelte";
import { type ColumnDef, createColumnHelper } from "./resource-table";

interface DemoRow {
	id: string;
	name: string;
	status: string;
}

const columnHelper = createColumnHelper<DemoRow>();

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
	renderComponent(ResourceTable, {
		data: [],
		columns,
		loading: true,
	});

	await expect.element(page.getByText("Loading...")).toBeInTheDocument();
});

test("renders the empty state when no rows are provided", async () => {
	renderComponent(ResourceTable, {
		data: [],
		columns,
		emptyMessage: "No resources found.",
	});

	await expect
		.element(page.getByText("No resources found."))
		.toBeInTheDocument();
});

test("renders rows through the shared table wrapper", async () => {
	renderComponent(ResourceTable, {
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
