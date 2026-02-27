import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTunnel } from "@my-app/proxy";
import alchemy from "alchemy";
import {
	createCloudflareApi,
	D1Database,
	enableWorkerSubdomain,
	getAccountSubdomain,
	Queue,
	SvelteKit,
	Worker,
} from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { config } from "dotenv";

const appName = "my-app";
const infraDir = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DEV_AUTH_SECRET = "local-dev-secret";
const LOCAL_DEV_OPEN_ROUTER_API_KEY = "local-dev-open-router-key";
const E2E_AUTH_SECRET = "e2e-local-auth-secret";
const E2E_OPEN_ROUTER_API_KEY = "e2e-local-open-router-key";
type CloudflareApi = Awaited<ReturnType<typeof createCloudflareApi>>;

const readNonEmptyEnv = (name: string): string | undefined => {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
};

const loadEnvFile = (relativePath: string): void => {
	const absolutePath = path.resolve(infraDir, relativePath);
	if (!existsSync(absolutePath)) {
		return;
	}
	config({ path: absolutePath, override: false });
};

// Prevent crash when dev server rebuild terminates in-flight HTTP connections.
// undici emits unhandled 'error' events on aborted fetch streams during restart.
process.on("uncaughtException", (error) => {
	if (
		error instanceof TypeError &&
		error.message === "terminated" &&
		"cause" in error &&
		error.cause instanceof Error &&
		"code" in error.cause &&
		error.cause.code === "UND_ERR_SOCKET"
	) {
		return;
	}
	console.error(error);
	process.exit(1);
});

// Parse --stage from CLI or default to "dev"
const stageIndex = process.argv.indexOf("--stage");
const stage =
	(stageIndex !== -1 ? process.argv[stageIndex + 1] : undefined) ??
	process.env.STAGE ??
	"dev";
const isE2E = process.env.ALCHEMY_E2E === "1" || stage === "e2e";
const lifecycleEvent = process.env.npm_lifecycle_event ?? "";
const isDeployCommand =
	lifecycleEvent === "deploy" || process.argv.includes("deploy");
const isDestroyCommand =
	lifecycleEvent === "destroy" || process.argv.includes("destroy");

// Only deploy/destroy commands should run with cloud deploy semantics.
const isDeploying = isDeployCommand || isDestroyCommand;
const isLocalDevRuntime = !isDeploying;
const workerScriptNames = [
	`${appName}-server-${stage}`,
	`${appName}-notifications-${stage}`,
	`${appName}-assistant-${stage}`,
	`${appName}-web-${stage}`,
];

let serverStageEnvPath = `../../apps/server/.env.${stage}`;
if (isE2E) {
	serverStageEnvPath = "../../apps/server/.env.e2e";
} else if (stage === "prod" || stage === "production") {
	serverStageEnvPath = "../../apps/server/.env.production";
}

// Environment layering:
// 1) shell/CI env (highest priority, never overridden by dotenv)
// 2) stage-specific files (.env.e2e / .env.{stage})
// 3) base defaults (.env)
// Keep stage files focused on overrides to avoid duplicated keys.
if (isE2E) {
	loadEnvFile("./.env.e2e");
}
loadEnvFile("./.env");
loadEnvFile("../../.env");

loadEnvFile(serverStageEnvPath);
loadEnvFile("../../apps/server/.env");

if (isE2E) {
	// Safety rail: never use real Cloudflare account credentials in e2e runs.
	process.env.CLOUDFLARE_API_TOKEN = "local-e2e-token";
	process.env.CLOUDFLARE_API_KEY = "";
	process.env.CLOUDFLARE_ACCOUNT_ID = "local-e2e-account";
	process.env.CF_ACCOUNT_ID = "local-e2e-account";
	process.env.BETTER_AUTH_SECRET ??= E2E_AUTH_SECRET;
	process.env.OPEN_ROUTER_API_KEY ??= E2E_OPEN_ROUTER_API_KEY;
}

const resolveRuntimeSecret = (name: string, localFallback: string): string => {
	const configured = readNonEmptyEnv(name);
	if (configured) {
		return configured;
	}
	if (isLocalDevRuntime) {
		console.warn(
			`[infra] ${name} is missing; using a local placeholder for non-deploy runtime.`
		);
		return localFallback;
	}
	if (isDestroyCommand) {
		return localFallback;
	}
	throw new Error(
		`[infra] Missing required ${name}. Configure it via shell, CI secret, or env file before deploy.`
	);
};

const betterAuthSecret = resolveRuntimeSecret(
	"BETTER_AUTH_SECRET",
	LOCAL_DEV_AUTH_SECRET
);
const openRouterApiKey = resolveRuntimeSecret(
	"OPEN_ROUTER_API_KEY",
	LOCAL_DEV_OPEN_ROUTER_API_KEY
);
const telegramBotToken = readNonEmptyEnv("TELEGRAM_BOT_TOKEN") ?? "";
const telegramBotUsername = readNonEmptyEnv("TELEGRAM_BOT_USERNAME") ?? "";
const telegramBotApiBaseUrl =
	readNonEmptyEnv("TELEGRAM_BOT_API_BASE_URL") ?? "";
const cloudpaymentsPublicId =
	readNonEmptyEnv("CLOUDPAYMENTS_PUBLIC_ID") ??
	readNonEmptyEnv("PUBLIC_CLOUDPAYMENTS_PUBLIC_ID") ??
	"";
const cloudpaymentsApiSecret =
	readNonEmptyEnv("CLOUDPAYMENTS_API_SECRET") ?? "";
const aiModel = readNonEmptyEnv("AI_MODEL") ?? "openai/gpt-5-nano:nitro";
const publicCloudpaymentsPublicId =
	readNonEmptyEnv("PUBLIC_CLOUDPAYMENTS_PUBLIC_ID") ?? "";
let workersSubdomain = readNonEmptyEnv("CLOUDFLARE_WORKERS_SUBDOMAIN");
let deployApi: CloudflareApi | undefined;

if (isDeploying) {
	deployApi = await createCloudflareApi();
	if (!workersSubdomain) {
		workersSubdomain = await getAccountSubdomain(deployApi).catch(() => {
			console.warn(
				"[infra] Could not auto-resolve workers.dev subdomain. Set CLOUDFLARE_WORKERS_SUBDOMAIN if deploy URL derivation is needed."
			);
			return undefined;
		});
	}
}

// Capture whether real Cloudflare API credentials are available BEFORE placeholder
// overrides.
const hasRealCloudflareCredentials = !!(
	readNonEmptyEnv("CLOUDFLARE_API_TOKEN") ||
	readNonEmptyEnv("CLOUDFLARE_API_KEY")
);

// In offline local dev, set placeholder credentials so Miniflare boots without
// requiring a real Cloudflare account discovery network call.
if (isLocalDevRuntime) {
	if (!hasRealCloudflareCredentials) {
		process.env.CLOUDFLARE_API_TOKEN = "local-dev-token";
		console.warn(
			"[infra] CLOUDFLARE_API_TOKEN is missing; using local placeholder token for offline dev."
		);
	}
	if (
		!(
			readNonEmptyEnv("CLOUDFLARE_ACCOUNT_ID") ||
			readNonEmptyEnv("CF_ACCOUNT_ID")
		)
	) {
		console.warn(
			"[infra] CLOUDFLARE_ACCOUNT_ID is missing; using local placeholder accountId for offline dev."
		);
	}
}

const localCloudflareAccountId =
	readNonEmptyEnv("CLOUDFLARE_ACCOUNT_ID") ??
	readNonEmptyEnv("CF_ACCOUNT_ID") ??
	(isLocalDevRuntime ? "local-dev-account" : undefined);
const cloudflareApiOptions: { accountId?: string } = isLocalDevRuntime
	? { accountId: localCloudflareAccountId }
	: {};

if (isDeployCommand && !deployApi) {
	throw new Error(
		"[infra] Cloudflare API client is unavailable for deploy. Check credentials."
	);
}

const app = await alchemy(appName, {
	stage,
	password: process.env.ALCHEMY_PASSWORD ?? "local-dev-password",
	stateStore: process.env.ALCHEMY_STATE_TOKEN
		? (scope) => new CloudflareStateStore(scope)
		: undefined,
});

const db = await D1Database("database", {
	migrationsDir: "../../packages/db/src/migrations",
	adopt: isDeploying,
	...cloudflareApiOptions,
});

const TWO_WEEKS_SEC = 60 * 60 * 24 * 14;

// Creates a queue + dead-letter queue pair with standard retention.
const createQueuePair = async (name: string) => {
	const dlq = await Queue(`${name}-dlq`, {
		adopt: isDeploying,
		settings: { messageRetentionPeriod: TWO_WEEKS_SEC },
		...cloudflareApiOptions,
	});
	const queue = await Queue(`${name}-queue`, {
		adopt: isDeploying,
		dlq,
		settings: { messageRetentionPeriod: TWO_WEEKS_SEC },
		...cloudflareApiOptions,
	});
	return { queue, dlq };
};

const { queue: notificationQueue, dlq: notificationDeadLetterQueue } =
	await createQueuePair("notification");
const { queue: recurringTaskQueue, dlq: recurringTaskDeadLetterQueue } =
	await createQueuePair("recurring-task");

const parsePort = (value: string | undefined, fallback: number): number => {
	if (!value) {
		return fallback;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const serverPort = parsePort(process.env.SERVER_PORT, 3000);
const notificationsPort = parsePort(process.env.NOTIFICATIONS_PORT, 3001);
const assistantPort = parsePort(process.env.ASSISTANT_PORT, 3002);

// Local dev uses localhost ports, deployed stages use their web URL
const devCorsOrigin =
	"http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:43173";

// Start ngrok tunnel in local dev when explicitly enabled via ALCHEMY_TUNNEL=1
const shouldStartTunnel =
	isLocalDevRuntime && process.env.ALCHEMY_TUNNEL === "1";

// When tunnel is active, configure SvelteKit base path and server URL
// before alchemy spawns the dev servers
if (shouldStartTunnel) {
	process.env.BASE_PATH = "/web";
}

const getCorsOrigin = (): string => {
	// Local development - use localhost origins
	if (!isDeploying) {
		const base = readNonEmptyEnv("CORS_ORIGIN") ?? devCorsOrigin;
		// When tunnel is active, also allow the ngrok domain
		const ngrokDomain = process.env.NGROK_DOMAIN_NAME;
		if (shouldStartTunnel && ngrokDomain) {
			return `${base},https://${ngrokDomain}`;
		}
		return base;
	}
	const explicitCorsOrigin = readNonEmptyEnv("CORS_ORIGIN");
	if (explicitCorsOrigin) {
		return explicitCorsOrigin;
	}
	// PR previews - allow all origins
	if (stage.startsWith("pr-")) {
		return "*";
	}
	if (workersSubdomain) {
		return `https://${appName}-web-${stage}.${workersSubdomain}.workers.dev`;
	}
	if (isDestroyCommand) {
		return "*";
	}
	throw new Error(
		"[infra] CORS_ORIGIN is required for deploy when workers.dev subdomain cannot be resolved."
	);
};

// Derive the canonical server URL — single source of truth for all service-to-service links.
// BETTER_AUTH_URL is kept as an alias (auth lives on the server worker).
const getServerUrl = (): string => {
	if (!isDeploying) {
		return (
			readNonEmptyEnv("SERVER_URL") ??
			readNonEmptyEnv("BETTER_AUTH_URL") ??
			`http://localhost:${serverPort}`
		);
	}
	const explicit =
		readNonEmptyEnv("SERVER_URL") ?? readNonEmptyEnv("BETTER_AUTH_URL");
	if (explicit) {
		return explicit;
	}
	if (workersSubdomain) {
		return `https://${appName}-server-${stage}.${workersSubdomain}.workers.dev`;
	}
	if (isDestroyCommand) {
		return "https://destroy.invalid";
	}
	throw new Error(
		"[infra] SERVER_URL is required for deploy when workers.dev subdomain cannot be resolved."
	);
};

const serverUrl = getServerUrl();
// Auth lives on the server worker — BETTER_AUTH_URL = SERVER_URL
const betterAuthUrl = serverUrl;

const getAssistantUrl = (): string => {
	if (!isDeploying) {
		return (
			readNonEmptyEnv("ASSISTANT_URL") ?? `http://localhost:${assistantPort}`
		);
	}
	const explicit = readNonEmptyEnv("ASSISTANT_URL");
	if (explicit) {
		return explicit;
	}
	if (workersSubdomain) {
		return `https://${appName}-assistant-${stage}.${workersSubdomain}.workers.dev`;
	}
	if (isDestroyCommand) {
		return "https://destroy.invalid";
	}
	throw new Error(
		"[infra] ASSISTANT_URL is required for deploy when workers.dev subdomain cannot be resolved."
	);
};

export const server = await Worker("server", {
	cwd: "../../apps/server",
	entrypoint: "src/index.ts",
	compatibility: "node",
	adopt: isDeploying,
	...cloudflareApiOptions,
	bindings: {
		DB: db,
		NOTIFICATION_QUEUE: notificationQueue,
		RECURRING_TASK_QUEUE: recurringTaskQueue,
		OPEN_ROUTER_API_KEY: alchemy.secret.env(
			"OPEN_ROUTER_API_KEY",
			openRouterApiKey
		),
		AI_MODEL: aiModel,
		CORS_ORIGIN: getCorsOrigin(),
		BETTER_AUTH_SECRET: alchemy.secret.env(
			"BETTER_AUTH_SECRET",
			betterAuthSecret
		),
		SERVER_URL: serverUrl,
		BETTER_AUTH_URL: betterAuthUrl,
		TELEGRAM_BOT_TOKEN: alchemy.secret.env(
			"TELEGRAM_BOT_TOKEN",
			telegramBotToken
		),
		TELEGRAM_BOT_USERNAME: telegramBotUsername,
		TELEGRAM_BOT_API_BASE_URL: telegramBotApiBaseUrl,
		CLOUDPAYMENTS_PUBLIC_ID: cloudpaymentsPublicId,
		CLOUDPAYMENTS_API_SECRET: alchemy.secret.env(
			"CLOUDPAYMENTS_API_SECRET",
			cloudpaymentsApiSecret
		),
	},
	eventSources: [
		{
			queue: recurringTaskQueue,
			settings: {
				batchSize: 10,
				maxConcurrency: 2,
				maxRetries: 4,
				maxWaitTimeMs: 1500,
				retryDelay: 30,
				deadLetterQueue: recurringTaskDeadLetterQueue,
			},
		},
	],
	dev: { port: serverPort },
	observability: {
		enabled: true,
		logs: { enabled: true, invocationLogs: true },
	},
});

export const notifications = await Worker("notifications", {
	cwd: "../../apps/notifications",
	entrypoint: "src/index.ts",
	compatibility: "node",
	adopt: isDeploying,
	...cloudflareApiOptions,
	bindings: {
		DB: db,
		CORS_ORIGIN: getCorsOrigin(),
		BETTER_AUTH_SECRET: alchemy.secret.env(
			"BETTER_AUTH_SECRET",
			betterAuthSecret
		),
		SERVER_URL: serverUrl,
		BETTER_AUTH_URL: betterAuthUrl,
		TELEGRAM_BOT_TOKEN: alchemy.secret.env(
			"TELEGRAM_BOT_TOKEN",
			telegramBotToken
		),
		TELEGRAM_BOT_API_BASE_URL: telegramBotApiBaseUrl,
	},
	eventSources: [
		{
			queue: notificationQueue,
			settings: {
				batchSize: 10,
				maxConcurrency: 2,
				maxRetries: 4,
				maxWaitTimeMs: 1500,
				retryDelay: 30,
				deadLetterQueue: notificationDeadLetterQueue,
			},
		},
	],
	dev: { port: notificationsPort },
	observability: {
		enabled: true,
		logs: { enabled: true, invocationLogs: true },
	},
});

export const assistant = await Worker("assistant", {
	cwd: "../../apps/assistant",
	entrypoint: "src/index.ts",
	compatibility: "node",
	adopt: isDeploying,
	...cloudflareApiOptions,
	bindings: {
		DB: db,
		SERVER_WORKER: server,
		SERVER_URL: serverUrl,
		CORS_ORIGIN: getCorsOrigin(),
		BETTER_AUTH_SECRET: alchemy.secret.env(
			"BETTER_AUTH_SECRET",
			betterAuthSecret
		),
		BETTER_AUTH_URL: betterAuthUrl,
		OPEN_ROUTER_API_KEY: alchemy.secret.env(
			"OPEN_ROUTER_API_KEY",
			openRouterApiKey
		),
		AI_MODEL: aiModel,
	},
	dev: { port: assistantPort },
	observability: {
		enabled: true,
		logs: { enabled: true, invocationLogs: true },
	},
});

const shouldStartWeb = process.env.ALCHEMY_SKIP_WEB !== "1";

export const web = shouldStartWeb
	? await SvelteKit("web", {
			cwd: "../../apps/web",
			adopt: isDeploying,
			...cloudflareApiOptions,
			bindings: {
				// When tunnel is active, use relative paths so browser API calls
				// go through the ngrok origin (same-origin → /server/rpc)
				PUBLIC_SERVER_URL: shouldStartTunnel ? "/server" : serverUrl,
				PUBLIC_ASSISTANT_URL: shouldStartTunnel
					? "/assistant"
					: getAssistantUrl(),
				PUBLIC_BASE_PATH: shouldStartTunnel ? "/web" : "",
				PUBLIC_CLOUDPAYMENTS_PUBLIC_ID: publicCloudpaymentsPublicId,
			},
			observability: {
				enabled: true,
				logs: { enabled: true, invocationLogs: true },
			},
		})
	: undefined;

if (web) {
	console.log(`Web    -> ${web.url}`);
}
console.log(`Server -> ${server.url}`);
console.log(`Assist -> ${assistant.url}`);
console.log(`Notify -> ${notifications.url}`);

if (shouldStartTunnel) {
	// Set NGROK_AUTHTOKEN for the SDK (it reads this specific env var)
	process.env.NGROK_AUTHTOKEN ??= process.env.NGROK_AUTH_TOKEN;

	try {
		const tunnelUrl = await startTunnel({
			upstreams: {
				web: web?.url,
				server: server.url!,
				notifications: notifications.url!,
				assistant: assistant.url!,
			},
			ngrokDomain: process.env.NGROK_DOMAIN_NAME || undefined,
		});
		console.log(`Tunnel -> ${tunnelUrl}`);
	} catch (err) {
		console.error("[infra] ngrok tunnel failed to start:", err);
	}
}

await app.finalize();

if (isDeployCommand) {
	// Enable workers.dev subdomain for all workers after deployment (previews disabled).
	if (!deployApi) {
		throw new Error(
			"[infra] Cloudflare API client is unavailable for deploy finalization."
		);
	}
	await Promise.all(
		workerScriptNames.map((scriptName) =>
			enableWorkerSubdomain(deployApi, scriptName, false)
		)
	);
}
