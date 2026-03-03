import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

import { relations } from "../relations";

const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	"postgresql://postgres:postgres@localhost:5432/myapp_test";

const createRawTestDatabase = async () => {
	const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
	await client.connect();
	const db = drizzle({ client, relations });
	return { db, client };
};

export type TestDatabase = Awaited<
	ReturnType<typeof createRawTestDatabase>
>["db"];

export type TestDatabaseSeed = (db: TestDatabase) => void | Promise<void>;

export interface BootstrapTestDatabaseOptions {
	seed?: TestDatabaseSeed;
	seedStrategy?: "beforeAll" | "beforeEach";
}

let testBootstrapCounter = 0;

export const createTestDatabase = async (): Promise<{
	db: TestDatabase;
	close: () => Promise<void>;
}> => {
	const { db, client } = await createRawTestDatabase();
	return { db, close: () => client.end() };
};

export const clearTestDatabase = async (db: TestDatabase): Promise<void> => {
	const result = await db.execute(sql`
		SELECT tablename FROM pg_tables
		WHERE schemaname = 'public'
		AND tablename != '__drizzle_migrations'
	`);

	const tables = (result.rows as { tablename: string }[]).map(
		(r) => r.tablename
	);

	if (tables.length > 0) {
		await db.execute(
			sql.raw(
				`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`
			)
		);
	}
};

export const bootstrapTestDatabase = (
	options: BootstrapTestDatabaseOptions = {}
): {
	db: TestDatabase;
	close: () => Promise<void>;
} => {
	let testDb: TestDatabase;
	let closeFn: () => Promise<void>;
	const seedStrategy = options.seedStrategy ?? "beforeAll";

	// Expose a proxy that defers to the real db once connected
	const state = {
		db: undefined as unknown as TestDatabase,
		close: async () => {
			await closeFn?.();
		},
	};

	beforeAll(async () => {
		const result = await createTestDatabase();
		testDb = result.db;
		closeFn = result.close;
		state.db = testDb;

		if (seedStrategy === "beforeAll" && options.seed) {
			await options.seed(testDb);
		}
	});

	beforeEach(async () => {
		if (seedStrategy === "beforeEach") {
			await clearTestDatabase(testDb);
			if (options.seed) {
				await options.seed(testDb);
			}
			return;
		}

		// Use a savepoint for beforeAll strategy
		await testDb.execute(sql.raw(`SAVEPOINT test_sp_${testBootstrapCounter}`));
	});

	afterEach(async () => {
		if (seedStrategy === "beforeEach") {
			return;
		}

		await testDb.execute(
			sql.raw(`ROLLBACK TO SAVEPOINT test_sp_${testBootstrapCounter}`)
		);
		await testDb.execute(
			sql.raw(`RELEASE SAVEPOINT test_sp_${testBootstrapCounter}`)
		);
	});

	afterAll(async () => {
		testBootstrapCounter++;
		await closeFn?.();
	});

	return state;
};
