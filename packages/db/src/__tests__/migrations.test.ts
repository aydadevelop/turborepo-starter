/**
 * Baseline migration smoke check.
 *
 * Verifies that committed migration artifacts exist and are structurally sound
 * so CI catches regressions before reaching a real Postgres environment.
 *
 * This is NOT a full integration test — it checks the artifact layer only.
 * Real-Postgres migration apply is covered by `db:verify:postgres`.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../src/migrations");

describe("Migration artifacts", () => {
	it("migrations directory exists and is committed", () => {
		expect(existsSync(migrationsDir)).toBe(true);
		expect(statSync(migrationsDir).isDirectory()).toBe(true);
	});

	it("contains at least one migration entry", () => {
		const entries = readdirSync(migrationsDir);
		expect(entries.length).toBeGreaterThan(0);
	});

	it("each migration entry contains a migration.sql file", () => {
		const entries = readdirSync(migrationsDir).filter((e) =>
			statSync(path.join(migrationsDir, e)).isDirectory()
		);
		expect(entries.length).toBeGreaterThan(0);

		for (const entry of entries) {
			const sqlPath = path.join(migrationsDir, entry, "migration.sql");
			expect(existsSync(sqlPath), `${entry}/migration.sql should exist`).toBe(
				true
			);
		}
	});

	it("migration.sql files are non-empty and contain DDL statements", () => {
		const entries = readdirSync(migrationsDir).filter((e) =>
			statSync(path.join(migrationsDir, e)).isDirectory()
		);

		for (const entry of entries) {
			const sqlPath = path.join(migrationsDir, entry, "migration.sql");
			if (!existsSync(sqlPath)) continue;

			const content = readFileSync(sqlPath, "utf-8").trim();
			expect(content.length, `${entry}/migration.sql should not be empty`).toBeGreaterThan(0);
			// Must contain at least one DDL statement
			expect(
				/CREATE TABLE|CREATE TYPE|ALTER TABLE/i.test(content),
				`${entry}/migration.sql should contain DDL statements`
			).toBe(true);
		}
	});

	it("baseline migration covers core schema tables", () => {
		const entries = readdirSync(migrationsDir).filter((e) =>
			statSync(path.join(migrationsDir, e)).isDirectory()
		);

		const allSql = entries
			.map((entry) => {
				const sqlPath = path.join(migrationsDir, entry, "migration.sql");
				return existsSync(sqlPath) ? readFileSync(sqlPath, "utf-8") : "";
			})
			.join("\n");

		// Core tables expected from the current schema
		const requiredTables = [
			"user",
			"organization",
			"listing",
			"booking",
			"notification_event",
			"assistant_chat",
		];

		for (const table of requiredTables) {
			expect(
				allSql.includes(`CREATE TABLE "${table}"`),
				`Baseline migrations should include CREATE TABLE "${table}"`
			).toBe(true);
		}
	});
});
