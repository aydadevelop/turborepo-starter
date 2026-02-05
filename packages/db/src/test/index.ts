import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import {
	type BetterSQLite3Database,
	drizzle,
} from "drizzle-orm/better-sqlite3";

import { account, session, user, verification } from "../schema/auth";
import { todo } from "../schema/todo";

const schema = { account, session, user, verification, todo };

export type TestDatabase = BetterSQLite3Database<typeof schema>;

/**
 * Creates an in-memory SQLite database for testing with the full schema applied.
 * Use this for integration tests that need a real database.
 */
export const createTestDatabase = (): {
	db: TestDatabase;
	close: () => void;
} => {
	const sqlite = new Database(":memory:");

	// Enable WAL mode for better performance
	sqlite.pragma("journal_mode = WAL");

	const db = drizzle(sqlite, { schema });

	// Apply schema manually (matches the auth.ts and todo.ts schemas)
	sqlite.exec(`
		-- User table
		CREATE TABLE IF NOT EXISTS user (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			email_verified INTEGER NOT NULL DEFAULT 0,
			image TEXT,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);

		-- Session table
		CREATE TABLE IF NOT EXISTS session (
			id TEXT PRIMARY KEY,
			expires_at INTEGER NOT NULL,
			token TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			ip_address TEXT,
			user_agent TEXT,
			user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS session_userId_idx ON session(user_id);

		-- Account table
		CREATE TABLE IF NOT EXISTS account (
			id TEXT PRIMARY KEY,
			account_id TEXT NOT NULL,
			provider_id TEXT NOT NULL,
			user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			access_token TEXT,
			refresh_token TEXT,
			id_token TEXT,
			access_token_expires_at INTEGER,
			refresh_token_expires_at INTEGER,
			scope TEXT,
			password TEXT,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);
		CREATE INDEX IF NOT EXISTS account_userId_idx ON account(user_id);

		-- Verification table
		CREATE TABLE IF NOT EXISTS verification (
			id TEXT PRIMARY KEY,
			identifier TEXT NOT NULL,
			value TEXT NOT NULL,
			expires_at INTEGER NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);
		CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

		-- Todo table
		CREATE TABLE IF NOT EXISTS todo (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			text TEXT NOT NULL,
			completed INTEGER NOT NULL DEFAULT 0
		);
	`);

	return {
		db,
		close: () => sqlite.close(),
	};
};

/**
 * Clears all data from the test database (useful between tests)
 */
export const clearTestDatabase = (db: TestDatabase): void => {
	db.run(sql`DELETE FROM session`);
	db.run(sql`DELETE FROM account`);
	db.run(sql`DELETE FROM verification`);
	db.run(sql`DELETE FROM user`);
	db.run(sql`DELETE FROM todo`);
};
