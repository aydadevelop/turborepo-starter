import path from "node:path";
import { fileURLToPath } from "node:url";
import type BetterSqliteDatabase from "better-sqlite3";
import { sql } from "drizzle-orm";
import {
	type BetterSQLite3Database,
	drizzle,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { relations } from "../relations";
// biome-ignore lint/performance/noNamespaceImport: required by drizzle schema object
import * as schema from "../schema";

const migrationsFolder = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../migrations"
);

type TestSqliteClient = BetterSqliteDatabase.Database;

export type TestDatabase = BetterSQLite3Database<typeof schema> & {
	$client: TestSqliteClient;
};

export const createTestDatabase = (): {
	db: TestDatabase;
	close: () => void;
} => {
	const db = drizzle(":memory:", { schema, relations });
	db.$client.pragma("journal_mode = WAL");
	migrate(db, { migrationsFolder });

	return {
		db,
		close: () => db.$client.close(),
	};
};

export const clearTestDatabase = (db: TestDatabase): void => {
	const tables = db.$client
		.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'"
		)
		.all() as { name: string }[];

	db.$client.pragma("foreign_keys = OFF");
	for (const { name } of tables) {
		db.run(sql.raw(`DELETE FROM ${name}`));
	}
	db.$client.pragma("foreign_keys = ON");
};
