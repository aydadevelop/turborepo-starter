import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
	baseURL: "http://localhost:43173",
	serverURL: "http://127.0.0.1:43100",
	assistantURL: "http://127.0.0.1:43102",
	workersCi: 1,
	workersLocal: 2,
	webServerCommand: "bun run dev:web:e2e",
	backendServerCommand: "bun run dev:infra:e2e",
} as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const envFilesByPriority = [
	path.resolve(__dirname, ".env.e2e"),
	path.resolve(repoRoot, ".env.e2e"),
	path.resolve(repoRoot, "apps/web/.env.e2e"),
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

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const isLocalUrl = (value: string): boolean => {
	try {
		const parsed = new URL(value);
		return LOCAL_HOSTNAMES.has(parsed.hostname);
	} catch {
		return false;
	}
};

export interface PlaywrightRuntimeEnv {
	assistantURL: string;
	backendServerCommand: string;
	baseURL: string;
	isRemote: boolean;
	reuseExistingServers: boolean;
	serverURL: string;
	useManagedServers: boolean;
	webServerCommand: string;
	workers: number;
}

let cached: PlaywrightRuntimeEnv | null = null;
let envLoaded = false;

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

export const getPlaywrightRuntimeEnv = (): PlaywrightRuntimeEnv => {
	if (cached) {
		return cached;
	}
	loadRuntimeEnvFiles();

	const baseURL = readStringEnv("PLAYWRIGHT_BASE_URL", DEFAULTS.baseURL);
	const serverURL = readStringEnv("PLAYWRIGHT_SERVER_URL", DEFAULTS.serverURL);
	const assistantURL = readStringEnv(
		"PLAYWRIGHT_ASSISTANT_URL",
		DEFAULTS.assistantURL
	);
	const isCi = Boolean(process.env.CI);
	const workers = readPositiveIntEnv(
		"PLAYWRIGHT_WORKERS",
		isCi ? DEFAULTS.workersCi : DEFAULTS.workersLocal
	);

	process.env.PLAYWRIGHT_BASE_URL = baseURL;
	process.env.PLAYWRIGHT_SERVER_URL = serverURL;
	process.env.PLAYWRIGHT_ASSISTANT_URL = assistantURL;

	cached = {
		baseURL,
		serverURL,
		assistantURL,
		isRemote: !isLocalUrl(baseURL),
		useManagedServers: process.env.PLAYWRIGHT_MANAGED_SERVERS !== "0",
		reuseExistingServers: !isCi && process.env.PLAYWRIGHT_REUSE_SERVERS !== "0",
		webServerCommand: readStringEnv(
			"PLAYWRIGHT_WEB_SERVER_COMMAND",
			DEFAULTS.webServerCommand
		),
		backendServerCommand: readStringEnv(
			"PLAYWRIGHT_BACKEND_SERVER_COMMAND",
			DEFAULTS.backendServerCommand
		),
		workers,
	};

	return cached;
};
