import { db } from "@my-app/db";
import { ORPCError } from "@orpc/server";
import {
	and,
	eq,
	type InferInsertModel,
	type InferSelectModel,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

type TableWithId = PgTable & { id: PgColumn };
type TableWithIdAndOrg = TableWithId & { organizationId: PgColumn };

/**
 * Insert a row and return it using PostgreSQL's RETURNING clause.
 * Throws INTERNAL_SERVER_ERROR if the insert returns empty.
 */
export const insertAndReturn = async <T extends PgTable>(
	table: T,
	values: InferInsertModel<T>
): Promise<InferSelectModel<T>> => {
	const rows = (await db
		.insert(table)
		.values(values as never)
		.returning()) as InferSelectModel<T>[];

	const row = rows[0];
	if (!row) {
		throw new ORPCError("INTERNAL_SERVER_ERROR");
	}

	return row;
};

/**
 * Require a row belonging to an organization. Throws NOT_FOUND if missing.
 * Works for any table with `id` and `organizationId` columns.
 */
export const requireManaged = async <T extends TableWithIdAndOrg>(
	table: T,
	id: string,
	organizationId: string,
	errorMessage?: string
): Promise<InferSelectModel<T>> => {
	const [row] = await db
		.select()
		.from(table as any)
		.where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
		.limit(1);

	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: errorMessage,
		});
	}

	return row as InferSelectModel<T>;
};

/**
 * Require a row matching two arbitrary columns. Throws NOT_FOUND if missing.
 * Useful for ownership checks on compound keys.
 */
export const requireOwned = async <T extends PgTable>(
	table: T,
	column1: PgColumn,
	value1: string,
	column2: PgColumn,
	value2: string,
	errorMessage?: string
): Promise<InferSelectModel<T>> => {
	const [row] = await db
		.select()
		.from(table as any)
		.where(and(eq(column1, value1), eq(column2, value2)))
		.limit(1);

	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: errorMessage,
		});
	}

	return row as InferSelectModel<T>;
};

/**
 * Build a sanitized update payload by stripping undefined values.
 * Always includes `updatedAt: new Date()`.
 */
export const buildUpdatePayload = <T extends Record<string, unknown>>(
	fields: T
): Record<string, unknown> => {
	const sanitized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) {
			sanitized[key] = value;
		}
	}
	sanitized.updatedAt = new Date();
	return sanitized;
};
