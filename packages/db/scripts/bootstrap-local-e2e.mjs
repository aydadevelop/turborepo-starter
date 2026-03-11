#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const dbPackageRoot = path.resolve(__dirname, "..");
const seedScriptPath = path.resolve(__dirname, "./seed-e2e.mjs");

const DEFAULT_DATABASE_URL =
	"postgresql://postgres:postgres@127.0.0.1:5432/myapp";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getArgValue = (flagName) => {
	const args = process.argv.slice(2);
	const index = args.indexOf(flagName);
	if (index === -1 || index === args.length - 1) {
		return undefined;
	}
	return args[index + 1];
};

export const waitForDatabase = async ({
	timeoutMs = 60_000,
	pollIntervalMs = 500,
	connectionString =
		process.env.PLAYWRIGHT_DATABASE_URL ??
		process.env.DATABASE_URL ??
		DEFAULT_DATABASE_URL,
} = {}) => {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const client = new Client({ connectionString });
		try {
			await client.connect();
			await client.query("SELECT 1");
			await client.end();
			return;
		} catch {
			await client.end().catch(() => {});
			await delay(pollIntervalMs);
		}
	}

	throw new Error(
		`Timed out waiting for PostgreSQL at ${connectionString.replace(/\/\/.*@/, "//***@")}`
	);
};

/**
 * Reset the public schema and apply baseline migrations so bootstrap is fully
 * reproducible from committed artifacts (not schema-push guesswork).
 *
 * Flow: DROP/CREATE public schema + clear drizzle migration journal
 *       → drizzle-kit migrate
 *       (POST_MIGRATION_TRIGGERS_SQL hook is applied by separate caller if needed)
 */
const resetAndMigrateSchema = async (connectionString) => {
	// 1. Wipe the public schema and drizzle migration journal so drizzle-kit
	//    starts fresh and re-applies all committed migrations.
	//    __drizzle_migrations lives in its own `drizzle` schema, so it must be
	//    cleared separately from DROP SCHEMA public.
	const { Client } = pg;
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

	// 2. Apply committed Drizzle migration chain.
	try {
		execFileSync(
			"bunx",
			["drizzle-kit", "migrate", "--config", "drizzle.config.dev.ts"],
			{
				cwd: dbPackageRoot,
				stdio: "inherit",
				env: { ...process.env, DATABASE_URL: connectionString },
			}
		);
	} catch (error) {
		const fallback = path.resolve(repoRoot, "node_modules/.bin/drizzle-kit");
		if (!existsSync(fallback)) {
			throw error;
		}
		execFileSync(
			fallback,
			["migrate", "--config", "drizzle.config.dev.ts"],
			{
				cwd: dbPackageRoot,
				stdio: "inherit",
				env: { ...process.env, DATABASE_URL: connectionString },
			}
		);
	}
};

export const bootstrapLocalE2EDatabase = async ({ anchorDate } = {}) => {
	const resolvedAnchorDate =
		anchorDate ?? process.env.PLAYWRIGHT_SEED_ANCHOR_DATE ?? "2026-03-15";
	const connectionString =
		process.env.PLAYWRIGHT_DATABASE_URL ??
		process.env.DATABASE_URL ??
		DEFAULT_DATABASE_URL;

	await waitForDatabase({ connectionString });
	await resetAndMigrateSchema(connectionString);

	execFileSync("node", [seedScriptPath, "--anchor-date", resolvedAnchorDate], {
		cwd: repoRoot,
		stdio: "inherit",
		env: { ...process.env, DATABASE_URL: connectionString },
	});
};

const runFromCli = async () => {
	if (process.env.PLAYWRIGHT_SKIP_SEED === "1") {
		console.log(
			"[db:bootstrap-local-e2e] Skipping DB seed (PLAYWRIGHT_SKIP_SEED=1)"
		);
		return;
	}

	await bootstrapLocalE2EDatabase({
		anchorDate: getArgValue("--anchor-date"),
	});
};

const isMain =
	process.argv[1] &&
	path.resolve(process.argv[1]) ===
		path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
	runFromCli().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
