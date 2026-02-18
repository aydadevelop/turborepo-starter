import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const E2E_PORTS = [43_173, 43_100, 43_101, 43_102];
const e2ePaths = [
	"packages/infra/.alchemy/full-stack-cf-app/e2e",
	"packages/infra/.alchemy/out/full-stack-cf-app-server-e2e",
	"packages/infra/.alchemy/out/full-stack-cf-app-notifications-e2e",
	"packages/infra/.alchemy/out/full-stack-cf-app-assistant-e2e",
	".alchemy/miniflare",
];

const log = (message) => console.log(`[e2e:clean] ${message}`);

const killPort = (port) => {
	try {
		execSync(`lsof -ti tcp:${port} | xargs kill 2>/dev/null || true`, {
			cwd: rootDir,
			stdio: "ignore",
		});
		log(`Port ${port} cleared`);
	} catch {
		log(`Port ${port} clear skipped`);
	}
};

const removePath = (relativePath) => {
	const absolutePath = resolve(rootDir, relativePath);
	rmSync(absolutePath, { force: true, recursive: true });
	log(`Removed ${relativePath}`);
};

log("Starting strict e2e cleanup");

for (const port of E2E_PORTS) {
	killPort(port);
}

for (const path of e2ePaths) {
	removePath(path);
}

log("Strict e2e cleanup complete");
