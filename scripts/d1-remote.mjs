#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_NAME = "my-app";
const DB_PREFIX = `${APP_NAME}-database`;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const serverWorkspaceDir = resolve(repoRoot, "apps/server");

const usage = `
Remote D1 helper

Usage:
  bun run db:backup:remote -- --stage <stage> [--out <path>]
  bun run db:copy:remote -- --from-stage <source> --to-stage <target> --yes [--out <path>]

Examples:
  bun run db:backup:remote -- --stage prod
  bun run db:copy:remote -- --from-stage prod --to-stage test --yes

Notes:
  - Database names are resolved as ${DB_PREFIX}-<stage>.
  - copy creates a target pre-copy backup before writing data.
`;

function fail(message) {
	console.error(`[d1] ${message}`);
	console.error(usage.trim());
	process.exit(1);
}

function timestamp() {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

function getStageDbName(stage) {
	return `${DB_PREFIX}-${stage}`;
}

function defaultBackupPath(stage, label) {
	return resolve(
		process.cwd(),
		"backups",
		"d1",
		`${getStageDbName(stage)}-${label}-${timestamp()}.sql`
	);
}

function ensureParentDir(pathname) {
	mkdirSync(dirname(pathname), { recursive: true });
}

function runWrangler(args) {
	const result = spawnSync("bunx", ["wrangler", ...args], {
		stdio: "inherit",
		env: process.env,
		cwd: serverWorkspaceDir,
	});

	if (result.error) {
		throw result.error;
	}
	if ((result.status ?? 1) !== 0) {
		process.exit(result.status ?? 1);
	}
}

function backupStage(stage, outPath, reasonLabel) {
	const dbName = getStageDbName(stage);
	ensureParentDir(outPath);
	console.log(`[d1] Exporting ${dbName} (${reasonLabel}) -> ${outPath}`);
	runWrangler(["d1", "export", dbName, "--remote", "--output", outPath]);
	console.log(`[d1] Export complete: ${outPath}`);
}

function restoreFromFile(stage, sourcePath) {
	const dbName = getStageDbName(stage);
	console.log(`[d1] Restoring ${sourcePath} -> ${dbName}`);
	runWrangler([
		"d1",
		"execute",
		dbName,
		"--remote",
		"--file",
		sourcePath,
		"--yes",
	]);
	console.log(`[d1] Restore complete: ${dbName}`);
}

function parseFlags(argv) {
	const flags = {};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) {
			continue;
		}
		const key = token.slice(2);
		const next = argv[index + 1];
		if (!next || next.startsWith("--")) {
			flags[key] = true;
			continue;
		}
		flags[key] = next;
		index += 1;
	}
	return flags;
}

function required(flags, key) {
	const value = flags[key];
	if (typeof value !== "string" || value.length === 0) {
		fail(`Missing required flag: --${key}`);
	}
	return value;
}

const [, , rawCommand, ...rest] = process.argv;
const command = rawCommand?.toLowerCase();
const flags = parseFlags(rest);

if (
	!command ||
	command === "help" ||
	command === "--help" ||
	command === "-h" ||
	flags.help ||
	flags.h
) {
	console.log(usage.trim());
	process.exit(0);
}

if (command === "backup") {
	const stage = required(flags, "stage");
	const outPath = resolve(
		process.cwd(),
		typeof flags.out === "string"
			? flags.out
			: defaultBackupPath(stage, "backup")
	);
	backupStage(stage, outPath, "backup");
	process.exit(0);
}

if (command === "copy") {
	if (!flags.yes) {
		fail("Refusing copy without --yes");
	}

	const fromStage = required(flags, "from-stage");
	const toStage = required(flags, "to-stage");

	if (fromStage === toStage) {
		fail("Source and target stages must be different for copy");
	}

	const exportPath = resolve(
		process.cwd(),
		typeof flags.out === "string"
			? flags.out
			: defaultBackupPath(fromStage, `copy-to-${toStage}`)
	);

	backupStage(fromStage, exportPath, `copy-source-${fromStage}`);

	const targetBackup = defaultBackupPath(toStage, "pre-copy-backup");
	backupStage(toStage, targetBackup, `safety-backup-${toStage}`);

	restoreFromFile(toStage, exportPath);
	process.exit(0);
}

fail(`Unsupported command: ${command}`);
