import type { AnyPgColumn } from "drizzle-orm/pg-core";

import type { TestDatabase } from "../../index";

export const upsertFixtureById = async <
	TInsert extends Record<string, unknown>,
	TSelect extends Record<string, unknown>,
>(
	db: TestDatabase,
	table: Parameters<TestDatabase["insert"]>[0] & { id: AnyPgColumn },
	values: TInsert
): Promise<TSelect> => {
	const rows = (await db
		.insert(table)
		.values(values)
		.onConflictDoUpdate({
			target: table.id,
			set: values,
		})
		.returning()) as TSelect[];
	const row = rows[0];

	if (!row) {
		throw new Error("Fixture upsert returned no row");
	}

	return row as TSelect;
};
