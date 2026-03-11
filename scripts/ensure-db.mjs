#!/usr/bin/env node
/**
 * ensure-db.mjs — Start PostgreSQL via Docker Compose and wait until it's ready.
 * Called automatically before `bun dev`.
 *
 * If PostgreSQL is already reachable on the configured host/port (e.g. in CI
 * where GitHub Actions provides a service container), Docker startup is skipped
 * entirely so the script works in both local-dev and CI environments.
 */

import { execSync, spawnSync } from "node:child_process";
import net from "node:net";

const MAX_RETRIES = 30;
const RETRY_INTERVAL_MS = 1000;

const log = (msg) => console.log(`[db] ${msg}`);

/** Parse host/port from DATABASE_URL, falling back to localhost:5432. */
function getDbHostPort() {
	const url = process.env.DATABASE_URL;
	if (url) {
		try {
			const parsed = new URL(url);
			return { host: parsed.hostname || "localhost", port: Number(parsed.port) || 5432 };
		} catch {}
	}
	return { host: "localhost", port: 5432 };
}

/** TCP-level check — returns true if the port is already accepting connections. */
function tcpPing(host, port) {
	return new Promise((resolve) => {
		const socket = new net.Socket();
		const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 1000);
		socket.connect(port, host, () => { clearTimeout(timer); socket.destroy(); resolve(true); });
		socket.on("error", () => { clearTimeout(timer); resolve(false); });
	});
}

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

function ensurePlaywrightDatabaseExists() {
	const databaseUrl = process.env.PLAYWRIGHT_DATABASE_URL;
	if (!databaseUrl) {
		return;
	}

	log(`Ensuring Playwright database exists (${databaseUrl.replace(/\/\/.*@/, "//***@")})`);
	const result = spawnSync(
		"bun",
		["./src/e2e/ensure-database.ts", "--database-url", databaseUrl],
		{
			cwd: new URL("../packages/db", import.meta.url).pathname,
			stdio: "inherit",
			env: process.env,
		},
	);

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function bootstrapPlaywrightDatabase() {
	const databaseUrl = process.env.PLAYWRIGHT_DATABASE_URL;
	if (!databaseUrl) {
		return false;
	}

	log(
		`Bootstrapping Playwright database (${databaseUrl.replace(/\/\/.*@/, "//***@")})`
	);
	const result = spawnSync(
		"bun",
		["./src/e2e/bootstrap.ts", "--database-url", databaseUrl],
		{
			cwd: new URL("../packages/db", import.meta.url).pathname,
			stdio: "inherit",
			env: process.env,
		},
	);

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}

	return true;
}

/** Wait for postgres via docker-exec (used when Docker manages the DB). */
async function waitForPostgresViaDocker() {
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

/** Wait for postgres via direct TCP poll (used when an external DB is already running). */
async function waitForPostgresViaNetwork(host, port) {
	for (let i = 1; i <= MAX_RETRIES; i++) {
		if (await tcpPing(host, port)) {
			log("PostgreSQL is ready");
			return;
		}
		if (i < MAX_RETRIES) {
			process.stdout.write(`[db] Waiting for PostgreSQL on ${host}:${port}... (${i}/${MAX_RETRIES})\r`);
			await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
		}
	}
	console.error(`[db] PostgreSQL on ${host}:${port} failed to become ready`);
	process.exit(1);
}

const { host, port } = getDbHostPort();

const alreadyUp = await tcpPing(host, port);

if (alreadyUp) {
	log(`PostgreSQL already reachable on ${host}:${port} — skipping Docker startup.`);
	await waitForPostgresViaNetwork(host, port);
} else {
	if (!isDockerRunning()) {
		console.error("[db] Docker is not running. Please start Docker Desktop and try again.");
		process.exit(1);
	}
	startPostgres();
	await waitForPostgresViaDocker();
}

ensurePlaywrightDatabaseExists();

// For the dedicated Playwright database, use the typed bootstrap flow instead of
// drizzle push. That path resets the schema, runs migrations, and seeds the
// auth/org baseline in one place.
if (bootstrapPlaywrightDatabase()) {
	log("Skipping drizzle push because Playwright bootstrap already prepared the database.");
} else if (process.env.PLAYWRIGHT_SKIP_SEED === "1") {
// Push schema so tables exist before services start.
// Skip if PLAYWRIGHT_SKIP_SEED=1 (CI already ran db:push in a prior step).
	log("Skipping schema push (PLAYWRIGHT_SKIP_SEED=1).");
} else {
	log("Pushing database schema...");
	execSync("bunx drizzle-kit push --config drizzle.config.dev.ts", {
		cwd: new URL("../packages/db", import.meta.url).pathname,
		stdio: "inherit",
	});
}
