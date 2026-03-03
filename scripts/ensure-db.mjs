#!/usr/bin/env node
/**
 * ensure-db.mjs — Start PostgreSQL via Docker Compose and wait until it's ready.
 * Called automatically before `bun dev`.
 */

import { execSync, spawnSync } from "node:child_process";

const MAX_RETRIES = 30;
const RETRY_INTERVAL_MS = 1000;

const log = (msg) => console.log(`[db] ${msg}`);

function isDockerRunning() {
	const result = spawnSync("docker", ["info"], {
		stdio: ["pipe", "pipe", "pipe"],
	});
	return result.status === 0;
}

function startPostgres() {
	log("Starting PostgreSQL...");
	execSync("docker compose up -d db", {
		stdio: "inherit",
	});
}

async function waitForPostgres() {
	for (let i = 1; i <= MAX_RETRIES; i++) {
		const result = spawnSync(
			"docker",
			["compose", "exec", "db", "pg_isready", "-U", "postgres"],
			{ stdio: ["pipe", "pipe", "pipe"] }
		);
		if (result.status === 0) {
			log("PostgreSQL is ready");
			return;
		}
		if (i < MAX_RETRIES) {
			process.stdout.write(`[db] Waiting for PostgreSQL... (${i}/${MAX_RETRIES})\r`);
			await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
		}
	}
	console.error("[db] PostgreSQL failed to become ready");
	process.exit(1);
}

if (!isDockerRunning()) {
	console.error("[db] Docker is not running. Please start Docker Desktop and try again.");
	process.exit(1);
}

startPostgres();
await waitForPostgres();

// Push schema so tables exist before services start
log("Pushing database schema...");
execSync("bunx drizzle-kit push --config drizzle.config.dev.ts", {
	cwd: new URL("../packages/db", import.meta.url).pathname,
	stdio: "inherit",
});
