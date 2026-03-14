import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const setupDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(setupDir, "../../..");
const packageRoot = process.cwd();

const candidateEnvFiles = [
	path.join(packageRoot, ".env.test.local"),
	path.join(packageRoot, ".env.test"),
	path.join(packageRoot, ".env.local"),
	path.join(packageRoot, ".env"),
	path.join(workspaceRoot, ".env.test.local"),
	path.join(workspaceRoot, ".env.test"),
	path.join(workspaceRoot, ".env.local"),
	path.join(workspaceRoot, ".env"),
];

const loadedEnvFiles = new Set<string>();

for (const file of candidateEnvFiles) {
	if (loadedEnvFiles.has(file)) {
		continue;
	}

	loadDotenv({ path: file, override: false, quiet: true });
	loadedEnvFiles.add(file);
}

process.env.NODE_ENV ??= "test";
process.env.CORS_ORIGIN ??= "http://localhost:3000";
process.env.SERVER_URL ??= "http://localhost:3000";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.BETTER_AUTH_SECRET ??= "test-secret-0123456789-abcdef";