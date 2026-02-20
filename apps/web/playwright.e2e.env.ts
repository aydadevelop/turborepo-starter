import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
	baseURL: "http://localhost:5173",
	workersCi: 1,
	workersLocal: 2,
	webServerCommand: "bun run dev:vite",
} as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFilesByPriority = [
	path.resolve(__dirname, ".env.local"),
	path.resolve(__dirname, ".env"),
];

const readStringEnv = (key: string, fallback: string): string => {
	const value = process.env[key];
	if (!value) {
		return fallback;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : fallback;
};

const readPositiveIntEnv = (key: string, fallback: number): number => {
	const raw = process.env[key];
	if (!raw) {
		return fallback;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export interface E2ERuntimeEnv {
	baseURL: string;
	useManagedServers: boolean;
	reuseExistingServers: boolean;
	webServerCommand: string;
	workers: number;
}

let envLoaded = false;
let cached: E2ERuntimeEnv | null = null;

const loadRuntimeEnvFiles = (): void => {
	if (envLoaded) {
		return;
	}

	for (const file of envFilesByPriority) {
		if (existsSync(file)) {
			process.loadEnvFile(file);
		}
	}

	envLoaded = true;
};

export const getE2ERuntimeEnv = (): E2ERuntimeEnv => {
	if (cached) {
		return cached;
	}

	loadRuntimeEnvFiles();

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
