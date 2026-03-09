#!/usr/bin/env node
/**
 * Exports seed-namespace rows from a real Postgres database to a structured
 * JSON snapshot file. The snapshot is committed to the repo and serves as the
 * replayable baseline for Phase 1.
 *
 * Usage:
 *   node export-snapshot.mjs [--out ./snapshots/phase1-baseline.json] [--database-url <url>]
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
const DEFAULT_OUT = path.resolve(__dirname, "../snapshots/phase1-baseline.json");

/**
 * Tables to snapshot, in insert order (parents before children).
 * Each entry declares the WHERE clause used to select seed-namespace rows.
 */
const SNAPSHOT_TABLES = [
	{ table: "organization", where: `"id" LIKE 'seed_%'` },
	{ table: "user", where: `"id" LIKE 'seed_%'` },
	{ table: "account", where: `"id" LIKE 'seed_%'` },
	{ table: "member", where: `"id" LIKE 'seed_%'` },
	{ table: "invitation", where: `"id" LIKE 'seed_%'` },
	{ table: "user_consent", where: `"id" LIKE 'seed_%'` },
	{ table: "notification_event", where: `"id" LIKE 'seed_%'` },
	{ table: "notification_intent", where: `"id" LIKE 'seed_%'` },
	{ table: "notification_delivery", where: `"id" LIKE 'seed_%'` },
	{ table: "notification_in_app", where: `"id" LIKE 'seed_%'` },
	{ table: "notification_preference", where: `"id" LIKE 'seed_%'` },
	{ table: "todo", where: `"id" >= 900000 AND "id" <= 900999` },
	{ table: "assistant_chat", where: `"id" LIKE 'seed_%'` },
	{ table: "assistant_message", where: `"id" LIKE 'seed_%'` },
	{ table: "listing_type_config", where: `"id" LIKE 'seed_%'` },
	{ table: "organization_settings", where: `"id" LIKE 'seed_%'` },
	{ table: "listing", where: `"id" LIKE 'seed_%'` },
	{ table: "listing_pricing_profile", where: `"id" LIKE 'seed_%'` },
	{ table: "payment_provider_config", where: `"id" LIKE 'seed_%'` },
	{ table: "organization_payment_config", where: `"id" LIKE 'seed_%'` },
	{ table: "listing_publication", where: `"id" LIKE 'seed_%'` },
	{ table: "cancellation_policy", where: `"id" LIKE 'seed_%'` },
	{ table: "booking", where: `"id" LIKE 'seed_%'` },
];

const main = async () => {
	const { values } = parseArgs({
		options: {
			out: { type: "string" },
			"database-url": { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		strict: true,
	});

	if (values.help) {
		console.log(
			[
				"Usage: node export-snapshot.mjs [options]",
				"",
				"Options:",
				`  --out <path>            Output file path (default: ${DEFAULT_OUT})`,
				"  --database-url <url>    Postgres connection string",
				"  -h, --help              Show this help message",
			].join("\n")
		);
		process.exit(0);
	}

	const connectionString =
		values["database-url"] ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
	const outPath = values.out
		? path.resolve(process.cwd(), values.out)
		: DEFAULT_OUT;

	console.log(
		`Exporting snapshot from: ${connectionString.replace(/\/\/.*@/, "//***@")}`
	);

	const client = new Client({ connectionString });
	await client.connect();

	try {
		const tables = [];
		let totalRows = 0;

		for (const { table, where } of SNAPSHOT_TABLES) {
			const result = await client.query(
				`SELECT * FROM "${table}" WHERE ${where} ORDER BY "id"`
			);
			tables.push({ table, rows: result.rows });
			totalRows += result.rows.length;
			if (result.rows.length > 0) {
				console.log(`  ${table}: ${result.rows.length} rows`);
			}
		}

		const snapshot = {
			version: "1",
			source: "01-schema-baseline-replayability",
			exported_at: new Date().toISOString(),
			tables,
		};

		fs.mkdirSync(path.dirname(outPath), { recursive: true });
		fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

		console.log(`\nSnapshot written: ${outPath} (${totalRows} total rows)`);
	} finally {
		await client.end();
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
