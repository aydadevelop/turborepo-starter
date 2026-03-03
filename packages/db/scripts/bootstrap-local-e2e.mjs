#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const seedScriptPath = path.resolve(__dirname, "./seed-local.mjs");

const DEFAULT_DATABASE_URL =
	"postgresql://postgres:postgres@localhost:5432/myapp";

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
	connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
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

export const bootstrapLocalE2EDatabase = async ({
	scenario,
	anchorDate,
} = {}) => {
	const resolvedScenario =
		scenario ?? process.env.PLAYWRIGHT_SEED_SCENARIO ?? "baseline";
	const resolvedAnchorDate =
		anchorDate ?? process.env.PLAYWRIGHT_SEED_ANCHOR_DATE ?? "2026-03-15";

	await waitForDatabase();

	execFileSync(
		"node",
		[
			seedScriptPath,
			"--scenario",
			resolvedScenario,
			"--anchor-date",
			resolvedAnchorDate,
		],
		{
			cwd: repoRoot,
			stdio: "inherit",
		}
	);
};

const runFromCli = async () => {
	if (process.env.PLAYWRIGHT_SKIP_SEED === "1") {
		console.log(
			"[db:bootstrap-local-e2e] Skipping DB seed (PLAYWRIGHT_SKIP_SEED=1)"
		);
		return;
	}

	await bootstrapLocalE2EDatabase({
		scenario: getArgValue("--scenario"),
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
