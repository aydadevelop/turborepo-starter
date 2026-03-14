import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

import { relations } from "../relations";
import * as schema from "../schema";
import { POST_MIGRATION_TRIGGER_STATEMENTS } from "../triggers";

const require_ = createRequire(import.meta.url);
const { pushSchema } = require_(
	"drizzle-kit/api-postgres",
) as typeof import("drizzle-kit/api-postgres");

const createRawTestDatabase = async () => {
	const client = new PGlite();
	const db = drizzle({ client, relations });

	// Push schema to in-memory PGlite instance
	const { apply } = await pushSchema(schema, db as any);
	await apply();
	if (POST_MIGRATION_TRIGGER_STATEMENTS.length > 0) {
		for (const statement of POST_MIGRATION_TRIGGER_STATEMENTS) {
			await db.execute(sql.raw(statement));
		}
	}

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

export const createTestDatabase = async (): Promise<{
	db: TestDatabase;
	close: () => Promise<void>;
}> => {
	const { db, client } = await createRawTestDatabase();
	return { db, close: () => client.close() };
};

export const clearTestDatabase = async (db: TestDatabase): Promise<void> => {
	const result = await db.execute(sql`
		SELECT tablename FROM pg_tables
		WHERE schemaname = 'public'
		AND tablename != '__drizzle_migrations'
	`);

	const tables = (result.rows as { tablename: string }[]).map(
		(r) => r.tablename,
	);

	if (tables.length > 0) {
		await db.execute(
			sql.raw(
				`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`,
			),
		);
	}
};

export const bootstrapTestDatabase = (
	options: BootstrapTestDatabaseOptions = {},
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

		if (seedStrategy === "beforeAll") {
			await clearTestDatabase(testDb);
			if (options.seed) {
				await options.seed(testDb);
			}
		}
	}, 60_000);

	beforeEach(async () => {
		if (seedStrategy === "beforeEach") {
			await clearTestDatabase(testDb);
			if (options.seed) {
				await options.seed(testDb);
			}
			return;
		}

		// Wrap each test in a transaction; rolling back after restores seed state.
		await testDb.execute(sql`BEGIN`);
	});

	afterEach(async () => {
		if (seedStrategy === "beforeEach") {
			return;
		}

		await testDb.execute(sql`ROLLBACK`);
	});

	afterAll(async () => {
		await closeFn?.();
	});

	return state;
};

export type { ParityDeclaration, ParityResult } from "./parity";
export { createParityTest } from "./parity";
