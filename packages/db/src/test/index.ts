import path from "node:path";
import { fileURLToPath } from "node:url";
import type BetterSqliteDatabase from "better-sqlite3";
import { sql } from "drizzle-orm";
import {
	type BetterSQLite3Database,
	drizzle,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

import { relations } from "../relations";
// biome-ignore lint/performance/noNamespaceImport: required by drizzle schema object
import * as schema from "../schema";
import { POST_MIGRATION_TRIGGERS_SQL } from "../triggers";

const migrationsFolder = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../migrations"
);

type TestSqliteClient = BetterSqliteDatabase.Database;

export type TestDatabase = BetterSQLite3Database<typeof schema> & {
	$client: TestSqliteClient;
};

export type TestDatabaseSeed = (db: TestDatabase) => void | Promise<void>;

export interface BootstrapTestDatabaseOptions {
	seed?: TestDatabaseSeed;
	seedStrategy?: "beforeAll" | "beforeEach";
}

let testBootstrapCounter = 0;

export const createTestDatabase = (): {
	db: TestDatabase;
	close: () => void;
} => {
	const db = drizzle(":memory:", { schema, relations });
	db.$client.pragma("journal_mode = WAL");
	migrate(db, { migrationsFolder });
	if (POST_MIGRATION_TRIGGERS_SQL.trim().length > 0) {
		db.$client.exec(POST_MIGRATION_TRIGGERS_SQL);
	}

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

export const bootstrapTestDatabase = (
	options: BootstrapTestDatabaseOptions = {}
): {
	db: TestDatabase;
	close: () => void;
} => {
	const testDbState = createTestDatabase();
	const seedStrategy = options.seedStrategy ?? "beforeAll";
	const savepointName = `test_bootstrap_${testBootstrapCounter++}`;
	let savepointActive = false;

	beforeAll(async () => {
		testDbState.db.run(sql`PRAGMA foreign_keys = ON`);

		if (seedStrategy === "beforeAll" && options.seed) {
			await options.seed(testDbState.db);
		}
	});

	beforeEach(async () => {
		if (seedStrategy === "beforeEach") {
			clearTestDatabase(testDbState.db);
			if (options.seed) {
				await options.seed(testDbState.db);
			}
			return;
		}

		testDbState.db.run(sql.raw(`SAVEPOINT ${savepointName}`));
		savepointActive = true;
	});

	afterEach(() => {
		if (seedStrategy === "beforeEach" || !savepointActive) {
			return;
		}

		try {
			testDbState.db.run(sql.raw(`ROLLBACK TO SAVEPOINT ${savepointName}`));
			testDbState.db.run(sql.raw(`RELEASE SAVEPOINT ${savepointName}`));
		} finally {
			savepointActive = false;
		}
	});

	afterAll(() => {
		testDbState.close();
	});

	return testDbState;
};
