#!/usr/bin/env node
/**
 * e2e-kill-ports.mjs — Gracefully terminate processes bound to e2e ports.
 *
 * 1. SIGTERM every PID on the listed ports.
 * 2. Wait up to GRACE_MS for them to exit.
 * 3. SIGKILL any survivors.
 *
 * Usage:
 *   node scripts/e2e-kill-ports.mjs              # kills all e2e ports
 *   node scripts/e2e-kill-ports.mjs 43100 43101  # only the listed ports
 */

import { execSync } from "node:child_process";

const ALL_E2E_PORTS = [43_173, 43_100, 43_101, 43_102];
const GRACE_MS = 3000;
const POLL_MS = 200;

const log = (msg) => console.log(`[e2e:ports] ${msg}`);

/** Returns set of PIDs listening on the given port. */
const pidsOnPort = (port) => {
	try {
		const out = execSync(`lsof -ti tcp:${port}`, {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return new Set(
			out
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((s) => Number(s))
		);
	} catch {
		return new Set();
	}
};

const isAlive = (pid) => {
	try {
		process.kill(pid, 0); // signal 0 = existence check
		return true;
	} catch {
		return false;
	}
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const requestedPorts =
	process.argv.length > 2
		? process.argv.slice(2).map(Number).filter(Number.isFinite)
		: ALL_E2E_PORTS;

// 1. Collect all PIDs across the requested ports.
const allPids = new Set();
for (const port of requestedPorts) {
	for (const pid of pidsOnPort(port)) {
		allPids.add(pid);
	}
}

if (allPids.size === 0) {
	log("No processes on e2e ports — nothing to kill");
	process.exit(0);
}

log(
	`Sending SIGTERM to ${allPids.size} process(es): ${[...allPids].join(", ")}`
);

// 2. SIGTERM all of them.
for (const pid of allPids) {
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		// already gone
	}
}

// 3. Wait for graceful exit.
const deadline = Date.now() + GRACE_MS;
while (Date.now() < deadline) {
	const survivors = [...allPids].filter(isAlive);
	if (survivors.length === 0) {
		log("All processes terminated gracefully");
		process.exit(0);
	}
	await delay(POLL_MS);
}

// 4. SIGKILL stragglers.
const stragglers = [...allPids].filter(isAlive);
if (stragglers.length > 0) {
	log(`SIGKILL ${stragglers.length} straggler(s): ${stragglers.join(", ")}`);
	for (const pid of stragglers) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// already gone
		}
	}
}

log("Done");
