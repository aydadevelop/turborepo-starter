import {
	createColumnHelper as createColumnHelperBase,
	createTable as createTableBase,
	getCoreRowModel as getCoreRowModelBase,
	type ColumnDef as TanStackColumnDef,
	type RowData as TanStackRowData,
} from "@tanstack/table-core";
import type { Component } from "svelte";

export interface ResourceTableColumnMeta {
	align?: "left" | "center" | "right";
	cellClass?: string;
	headerClass?: string;
}

export type RowData = TanStackRowData;
export type ColumnDef<
	TData extends RowData = RowData,
	_TValue = unknown,
> = TanStackColumnDef<TData, any>;

export type ResourceTableRowAttributes = Record<
	string,
	string | number | boolean | undefined
>;

export interface ResourceRenderedComponent<
	Props extends Record<string, unknown> = Record<string, unknown>,
> {
	component: Component<Props>;
	kind: "component";
	props: Props;
}

export const renderComponent = <Props extends Record<string, unknown>>(
	component: Component<Props>,
	props: Props,
): ResourceRenderedComponent<Props> => ({
	kind: "component",
	component,
	props,
});

export const isRenderedComponent = (
	value: unknown,
): value is ResourceRenderedComponent =>
	typeof value === "object" &&
	value !== null &&
	"kind" in value &&
	(value as { kind?: unknown }).kind === "component";

export const createColumnHelper = createColumnHelperBase;
export const createTable = createTableBase;
export const getCoreRowModel = getCoreRowModelBase;
