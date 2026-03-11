import type { TestDatabase } from "../../index";

export const upsertFixtureById = async <
	TInsert extends Record<string, unknown>,
	TSelect extends Record<string, unknown>,
>(
	db: TestDatabase,
	table: any,
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
