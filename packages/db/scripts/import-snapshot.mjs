#!/usr/bin/env node
/**
 * Restores a snapshot created by export-snapshot.mjs into a real Postgres
 * database. Idempotent: uses ON CONFLICT DO UPDATE so safe to run on a
 * partially-populated database.
 *
 * Usage:
 *   node import-snapshot.mjs [--file ./snapshots/phase1-baseline.json] [--database-url <url>]
 */

import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATABASE_URL =
	"postgresql://postgres:postgres@127.0.0.1:5432/myapp";
const DEFAULT_FILE = path.resolve(__dirname, "../snapshots/phase1-baseline.json");

const quote = (identifier) => `"${identifier}"`;

/**
 * The pg client auto-parses JSONB columns into JS objects/arrays on read.
 * On write, plain objects/arrays are NOT auto-serialized to JSON — pg treats
 * them as PostgreSQL array literals and emits invalid JSON syntax errors.
 * Pre-serialize any object/array value so pg receives a valid JSON string.
 */
const serializeValues = (row) =>
	Object.fromEntries(
		Object.entries(row).map(([key, value]) => [
			key,
			value !== null && typeof value === "object" && !(value instanceof Date)
				? JSON.stringify(value)
				: value,
		])
	);

const upsert = async (client, table, rawRow) => {
	const row = serializeValues(rawRow);
	const columns = Object.keys(row);
	const values = Object.values(row);
	const placeholders = columns.map((_, i) => `$${i + 1}`);
	const updateColumns = columns.filter((c) => c !== "id");

	// Tables without a unique id column will need a different conflict target,
	// but all tables in the seed namespace have an "id" primary key.
	const sql = [
		`INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")})`,
		`VALUES (${placeholders.join(", ")})`,
		`ON CONFLICT ("id")`,
		`DO UPDATE SET ${updateColumns.map((c) => `${quote(c)} = EXCLUDED.${quote(c)}`).join(", ")}`,
	].join(" ");

	await client.query(sql, values);
};

const main = async () => {
	const { values } = parseArgs({
		options: {
			file: { type: "string" },
			"database-url": { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		strict: true,
	});

	if (values.help) {
		console.log(
			[
				"Usage: node import-snapshot.mjs [options]",
				"",
				"Options:",
				`  --file <path>           Snapshot file path (default: ${DEFAULT_FILE})`,
				"  --database-url <url>    Postgres connection string",
				"  -h, --help              Show this help message",
			].join("\n")
		);
		process.exit(0);
	}

	const connectionString =
		values["database-url"] ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
	const filePath = values.file
		? path.resolve(process.cwd(), values.file)
		: DEFAULT_FILE;

	if (!fs.existsSync(filePath)) {
		throw new Error(`Snapshot file not found: ${filePath}`);
	}

	const snapshot = JSON.parse(fs.readFileSync(filePath, "utf8"));
	console.log(
		`Restoring snapshot v${snapshot.version} (source: ${snapshot.source}, exported: ${snapshot.exported_at})`
	);
	console.log(`Target: ${connectionString.replace(/\/\/.*@/, "//***@")}`);

	const client = new Client({ connectionString });
	await client.connect();

	try {
		await client.query("BEGIN");
		try {
			for (const { table, rows } of snapshot.tables) {
				if (rows.length === 0) continue;
				for (const row of rows) {
					await upsert(client, table, row);
				}
				console.log(`  ${table}: restored ${rows.length} rows`);
			}
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}

		console.log("\nSnapshot restored successfully.");
	} finally {
		await client.end();
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
