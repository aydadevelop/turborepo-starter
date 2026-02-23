import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const e2ePaths = [
	"packages/infra/.alchemy/my-app/e2e",
	"packages/infra/.alchemy/out/my-app-server-e2e",
	"packages/infra/.alchemy/out/my-app-notifications-e2e",
	"packages/infra/.alchemy/out/my-app-assistant-e2e",
	".alchemy/miniflare",
];

const log = (message) => console.log(`[e2e:clean] ${message}`);

const removePath = (relativePath) => {
	const absolutePath = resolve(rootDir, relativePath);
	rmSync(absolutePath, { force: true, recursive: true });
	log(`Removed ${relativePath}`);
};

log("Starting strict e2e cleanup");

// Gracefully kill all e2e port processes (SIGTERM → wait → SIGKILL).
execFileSync("node", [resolve(rootDir, "scripts/e2e-kill-ports.mjs")], {
	cwd: rootDir,
	stdio: "inherit",
});

for (const path of e2ePaths) {
	removePath(path);
}

log("Strict e2e cleanup complete");
