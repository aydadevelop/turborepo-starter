import {
	createColumnHelper,
	createTable,
	getCoreRowModel,
	type ColumnDef,
	type RowData,
} from "@tanstack/table-core";
import type { Component } from "svelte";

export type ResourceTableColumnMeta = {
	headerClass?: string;
	cellClass?: string;
	align?: "left" | "center" | "right";
};

export type ResourceTableRowAttributes = Record<
	string,
	string | number | boolean | undefined
>;

export type ResourceRenderedComponent<
	Props extends Record<string, unknown> = Record<string, unknown>,
> = {
	kind: "component";
	component: Component<any>;
	props: Props;
};

export const renderComponent = <Props extends Record<string, unknown>>(
	component: Component<any>,
	props: Props
): ResourceRenderedComponent<Props> => ({
	kind: "component",
	component,
	props,
});

export const isRenderedComponent = (
	value: unknown
): value is ResourceRenderedComponent =>
	typeof value === "object" &&
	value !== null &&
	"kind" in value &&
	(value as { kind?: unknown }).kind === "component";

export { createColumnHelper, createTable, getCoreRowModel };
export type { ColumnDef, RowData };
