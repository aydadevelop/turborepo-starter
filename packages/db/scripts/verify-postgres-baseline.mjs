#!/usr/bin/env node
/**
 * Real-Postgres verification lane for the Phase 1 schema baseline.
 *
 * Proves the full baseline cycle works against real Postgres (not just PGlite):
 *   Step 1: Reset → migrate → seed
 *   Step 2: Export snapshot
 *   Step 3: Assert seeded state
 *   Step 4: Reset → migrate (no seed — clear data to prove restore)
 *   Step 5: Restore snapshot
 *   Step 6: Assert restored state matches seeded state
 *
 * Usage:
 *   DATABASE_URL=<url> node verify-postgres-baseline.mjs
 *
 * Requires:
 *   - Docker Postgres running (use `docker compose up -d db`)
 *   - DATABASE_URL pointing at the target database
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPackageRoot = path.resolve(__dirname, "..");
const SNAPSHOT_FILE = path.resolve(dbPackageRoot, "snapshots/phase1-baseline.json");
const ANCHOR_DATE = "2026-03-15";
const DEFAULT_DATABASE_URL =
	"postgresql://postgres:postgres@127.0.0.1:5432/myapp";

/** Minimum expected row counts after seed/restore. */
const EXPECTED_ROWS = {
	organization: 2,
	user: 3,
	listing: 1,
	listing_pricing_profile: 1,
	payment_provider_config: 1,
	organization_payment_config: 1,
	listing_publication: 1,
	cancellation_policy: 1,
	booking: 1,
};

const step = (label) => {
	const divider = "─".repeat(60);
	console.log(`\n${divider}`);
	console.log(`[verify] ${label}`);
	console.log(divider);
};

const assertRowCounts = async (connectionString, label) => {
	const client = new Client({ connectionString });
	await client.connect();
	const failures = [];
	try {
		for (const [table, expected] of Object.entries(EXPECTED_ROWS)) {
			const result = await client.query(`SELECT COUNT(*) FROM "${table}"`);
			const actual = Number(result.rows[0].count);
			if (actual < expected) {
				failures.push(`  ${table}: expected >= ${expected}, got ${actual}`);
			} else {
				console.log(`  ✓ ${table}: ${actual} rows`);
			}
		}
	} finally {
		await client.end();
	}

	if (failures.length > 0) {
		throw new Error(`Row count assertion failed (${label}):\n${failures.join("\n")}`);
	}
};

const execDrizzleKit = (args, connectionString) => {
	const drizzleKitPath = path.resolve(
		dbPackageRoot,
		"../../node_modules/.bin/drizzle-kit"
	);
	// Prefer bunx for speed; fall back to local drizzle-kit binary.
	try {
		execFileSync("bunx", ["drizzle-kit", ...args], {
			cwd: dbPackageRoot,
			stdio: "inherit",
			env: { ...process.env, DATABASE_URL: connectionString },
		});
	} catch {
		if (!existsSync(drizzleKitPath)) throw new Error("drizzle-kit not found");
		execFileSync(drizzleKitPath, args, {
			cwd: dbPackageRoot,
			stdio: "inherit",
			env: { ...process.env, DATABASE_URL: connectionString },
		});
	}
};

const resetAndMigrate = async (connectionString) => {
	const client = new Client({ connectionString });
	await client.connect();
	try {
		await client.query("DROP SCHEMA public CASCADE");
		await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
		await client.query("CREATE SCHEMA public");
		await client.query("GRANT ALL ON SCHEMA public TO postgres");
		await client.query("GRANT ALL ON SCHEMA public TO public");
	} finally {
		await client.end();
	}

	execDrizzleKit(["migrate", "--config", "drizzle.config.dev.ts"], connectionString);
};

const main = async () => {
	const connectionString =
		process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

	console.log(
		`\nReal-Postgres baseline verification`
	);
	console.log(
		`Database: ${connectionString.replace(/\/\/.*@/, "//***@")}`
	);

	// Step 1: Full bootstrap (reset → migrate → seed)
	step("Step 1: Reset → migrate → seed");
	await resetAndMigrate(connectionString);
	execFileSync(
		"node",
		[path.resolve(__dirname, "seed-local.mjs"), "--anchor-date", ANCHOR_DATE],
		{
			stdio: "inherit",
			env: { ...process.env, DATABASE_URL: connectionString },
		}
	);

	// Step 2: Export baseline snapshot
	step("Step 2: Export snapshot");
	execFileSync(
		"node",
		[
			path.resolve(__dirname, "export-snapshot.mjs"),
			"--out",
			SNAPSHOT_FILE,
		],
		{
			stdio: "inherit",
			env: { ...process.env, DATABASE_URL: connectionString },
		}
	);

	// Step 3: Assert seeded state
	step("Step 3: Assert seeded state");
	await assertRowCounts(connectionString, "after seed");

	// Step 4: Reset → migrate only (wipe data to prove restore)
	step("Step 4: Reset → migrate (wipe data)");
	await resetAndMigrate(connectionString);

	// Step 5: Restore snapshot
	step("Step 5: Restore snapshot");
	execFileSync(
		"node",
		[
			path.resolve(__dirname, "import-snapshot.mjs"),
			"--file",
			SNAPSHOT_FILE,
		],
		{
			stdio: "inherit",
			env: { ...process.env, DATABASE_URL: connectionString },
		}
	);

	// Step 6: Assert restored state
	step("Step 6: Assert restored state");
	await assertRowCounts(connectionString, "after restore");

	console.log("\n✅  Real-Postgres baseline verification PASSED.\n");
};

main().catch((error) => {
	console.error(`\n❌  Verification FAILED: ${error.message}\n`);
	process.exitCode = 1;
});
