#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const seedScriptPath = path.resolve(__dirname, "./seed-local.mjs");
const localD1Dir = path.resolve(
	repoRoot,
	".alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject"
);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getArgValue = (flagName) => {
	const args = process.argv.slice(2);
	const index = args.indexOf(flagName);
	if (index === -1 || index === args.length - 1) {
		return undefined;
	}
	return args[index + 1];
};

export const hasLocalSqliteDatabase = (d1Dir = localD1Dir) => {
	if (!existsSync(d1Dir)) {
		return false;
	}

	return readdirSync(d1Dir).some(
		(name) =>
			name.endsWith(".sqlite") &&
			!name.includes("-wal") &&
			!name.includes("-shm")
	);
};

export const waitForLocalD1 = async ({
	timeoutMs = 60_000,
	pollIntervalMs = 500,
	d1Dir = localD1Dir,
} = {}) => {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		if (hasLocalSqliteDatabase(d1Dir)) {
			return;
		}
		await delay(pollIntervalMs);
	}

	throw new Error(
		`Timed out waiting for local D1 sqlite files under ${d1Dir}.`
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

	await waitForLocalD1();

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
