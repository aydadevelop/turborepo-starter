import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	loadEnvFiles,
	readPositiveIntEnv,
	readStringEnv,
} from "@my-app/env/loader";

const DEFAULTS = {
	baseURL: "http://localhost:43173",
	serverURL: "http://localhost:43100",
	assistantURL: "http://localhost:43102",
	notificationsURL: "http://localhost:43101",
	siteURL: "http://localhost:43275",
	workersCi: 2,
	workersLocal: 2,
	webServerCommand: "bun run dev:web:e2e",
	serverCommand: "bun run start:server:e2e",
	assistantCommand: "bun run start:assistant:e2e",
	notificationsCommand: "bun run start:notifications:e2e",
} as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

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
	assistantCommand: string;
	assistantURL: string;
	baseURL: string;
	isRemote: boolean;
	notificationsCommand: string;
	notificationsURL: string;
	reuseExistingServers: boolean;
	serverCommand: string;
	serverURL: string;
	siteURL: string;
	useManagedServers: boolean;
	webServerCommand: string;
	workers: number;
}

let cached: PlaywrightRuntimeEnv | null = null;

export const getPlaywrightRuntimeEnv = (): PlaywrightRuntimeEnv => {
	if (cached) {
		return cached;
	}

	loadEnvFiles([
		path.resolve(__dirname, ".env.e2e"),
		path.resolve(repoRoot, ".env.e2e"),
		path.resolve(repoRoot, "apps/web/.env.e2e"),
	]);

	const baseURL = readStringEnv("PLAYWRIGHT_BASE_URL", DEFAULTS.baseURL);
	const serverURL = readStringEnv("PLAYWRIGHT_SERVER_URL", DEFAULTS.serverURL);
	const assistantURL = readStringEnv(
		"PLAYWRIGHT_ASSISTANT_URL",
		DEFAULTS.assistantURL
	);
	const notificationsURL = readStringEnv(
		"PLAYWRIGHT_NOTIFICATIONS_URL",
		DEFAULTS.notificationsURL
	);
	const siteURL = readStringEnv("PLAYWRIGHT_SITE_URL", DEFAULTS.siteURL);
	const isCi = Boolean(process.env.CI);
	const workers = readPositiveIntEnv(
		"PLAYWRIGHT_WORKERS",
		isCi ? DEFAULTS.workersCi : DEFAULTS.workersLocal
	);
	const legacyBackendCommand = process.env.PLAYWRIGHT_BACKEND_SERVER_COMMAND;

	process.env.PLAYWRIGHT_BASE_URL = baseURL;
	process.env.PLAYWRIGHT_SERVER_URL = serverURL;
	process.env.PLAYWRIGHT_ASSISTANT_URL = assistantURL;
	process.env.PLAYWRIGHT_NOTIFICATIONS_URL = notificationsURL;
	process.env.PLAYWRIGHT_SITE_URL = siteURL;

	cached = {
		baseURL,
		serverURL,
		assistantURL,
		notificationsURL,
		siteURL,
		isRemote: !isLocalUrl(baseURL),
		useManagedServers: process.env.PLAYWRIGHT_MANAGED_SERVERS !== "0",
		reuseExistingServers: !isCi && process.env.PLAYWRIGHT_REUSE_SERVERS !== "0",
		webServerCommand: readStringEnv(
			"PLAYWRIGHT_WEB_SERVER_COMMAND",
			DEFAULTS.webServerCommand
		),
		serverCommand: readStringEnv(
			"PLAYWRIGHT_SERVER_COMMAND",
			legacyBackendCommand ?? DEFAULTS.serverCommand
		),
		assistantCommand: readStringEnv(
			"PLAYWRIGHT_ASSISTANT_COMMAND",
			DEFAULTS.assistantCommand
		),
		notificationsCommand: readStringEnv(
			"PLAYWRIGHT_NOTIFICATIONS_COMMAND",
			DEFAULTS.notificationsCommand
		),
		workers,
	};

	return cached;
};
