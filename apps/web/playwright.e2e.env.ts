import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	loadEnvFiles,
	readPositiveIntEnv,
	readStringEnv,
} from "@my-app/env/loader";

const DEFAULTS = {
	baseURL: "http://localhost:5173",
	workersCi: 1,
	workersLocal: 2,
	webServerCommand: "bun run dev:vite",
} as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface E2ERuntimeEnv {
	baseURL: string;
	reuseExistingServers: boolean;
	useManagedServers: boolean;
	webServerCommand: string;
	workers: number;
}

let cached: E2ERuntimeEnv | null = null;

export const getE2ERuntimeEnv = (): E2ERuntimeEnv => {
	if (cached) {
		return cached;
	}

	loadEnvFiles([
		path.resolve(__dirname, ".env.local"),
		path.resolve(__dirname, ".env"),
	]);

	const baseURL = readStringEnv("PLAYWRIGHT_BASE_URL", DEFAULTS.baseURL);
	const isCi = Boolean(process.env.CI);
	const workers = readPositiveIntEnv(
		"PLAYWRIGHT_WORKERS",
		isCi ? DEFAULTS.workersCi : DEFAULTS.workersLocal
	);

	process.env.PLAYWRIGHT_BASE_URL = baseURL;

	cached = {
		baseURL,
		useManagedServers: process.env.PLAYWRIGHT_MANAGED_SERVERS !== "0",
		reuseExistingServers: !isCi && process.env.PLAYWRIGHT_REUSE_SERVERS !== "0",
		webServerCommand: readStringEnv(
			"PLAYWRIGHT_WEB_SERVER_COMMAND",
			DEFAULTS.webServerCommand
		),
		workers,
	};

	return cached;
};
