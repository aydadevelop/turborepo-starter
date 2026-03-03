import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const log = (message) => console.log(`[e2e:clean] ${message}`);

log("Starting e2e cleanup");

// Gracefully kill all e2e port processes (SIGTERM → wait → SIGKILL).
execFileSync("node", [resolve(rootDir, "scripts/e2e-kill-ports.mjs")], {
	cwd: rootDir,
	stdio: "inherit",
});

log("e2e cleanup complete");
