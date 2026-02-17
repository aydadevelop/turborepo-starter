import { startTunnel } from "@full-stack-cf-app/proxy";
import alchemy from "alchemy";
import {
	createCloudflareApi,
	D1Database,
	Queue,
	SvelteKit,
	Worker,
} from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { config } from "dotenv";

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
const appName = "full-stack-cf-app";
const lifecycleEvent = process.env.npm_lifecycle_event ?? "";
const isDeployCommand =
	lifecycleEvent === "deploy" || process.argv.includes("deploy");
const isDestroyCommand =
	lifecycleEvent === "destroy" || process.argv.includes("destroy");

// Only deploy/destroy commands (or CI) use production server env.
const isDeploying =
	isDeployCommand || isDestroyCommand || Boolean(process.env.CI);
const isLocalDevRuntime = !isDeploying;
const envPath = isDeploying ? ".production" : "";
config({ path: `../../apps/server/.env${envPath}` });
config({ path: "./.env" });

// Alchemy's Worker resource initializes Cloudflare API before local-mode branching.
// In offline local dev, provide deterministic fallback credentials so no account discovery
// network call is required to boot Miniflare workers.
const localCloudflareAccountId =
	process.env.CLOUDFLARE_ACCOUNT_ID ??
	process.env.CF_ACCOUNT_ID ??
	(isLocalDevRuntime ? "local-dev-account" : undefined);
const cloudflareApiOptions: { accountId?: string } = isLocalDevRuntime
	? {
			accountId: localCloudflareAccountId,
		}
	: {};

if (
	isLocalDevRuntime &&
	!process.env.CLOUDFLARE_API_TOKEN &&
	!process.env.CLOUDFLARE_API_KEY
) {
	process.env.CLOUDFLARE_API_TOKEN = "local-dev-token";
	console.warn(
		"[infra] CLOUDFLARE_API_TOKEN is missing; using local placeholder token for offline dev."
	);
}

if (
	isLocalDevRuntime &&
	!process.env.CLOUDFLARE_ACCOUNT_ID &&
	!process.env.CF_ACCOUNT_ID
) {
	console.warn(
		"[infra] CLOUDFLARE_ACCOUNT_ID is missing; using local placeholder accountId for offline dev."
	);
}

if (isDeployCommand) {
	const api = await createCloudflareApi();
	const disableWorkerPreviewUrls = async (scriptName: string) => {
		// Cloudflare rejects script uploads with DO migration metadata when Preview URLs are enabled.
		// This is controlled by the workers.dev subdomain setting `previews_enabled`.
		await api
			.post(
				`/accounts/${api.accountId}/workers/scripts/${scriptName}/subdomain`,
				{
					enabled: true,
					previews_enabled: false,
				}
			)
			.catch((error: unknown) => {
				// Script may not exist yet on first deploy; ignore 404.
				if (typeof error === "object" && error && "status" in error) {
					const status = (error as { status?: number }).status;
					if (status === 404) {
						return;
					}
				}
				throw error;
			});
	};

	await Promise.all([
		disableWorkerPreviewUrls(`${appName}-server-${stage}`),
		disableWorkerPreviewUrls(`${appName}-notifications-${stage}`),
		disableWorkerPreviewUrls(`${appName}-assistant-${stage}`),
		disableWorkerPreviewUrls(`${appName}-web-${stage}`),
	]);
}

const app = await alchemy(appName, {
	stage,
	stateStore: process.env.ALCHEMY_STATE_TOKEN
		? (scope) => new CloudflareStateStore(scope)
		: undefined,
});

const db = await D1Database("database", {
	migrationsDir: "../../packages/db/src/migrations",
	adopt: true, // Reuse existing database if it exists
	...cloudflareApiOptions,
});

const notificationDeadLetterQueue = await Queue("notificationDeadLetterQueue", {
	adopt: true,
	settings: {
		messageRetentionPeriod: 60 * 60 * 24 * 14, // 14 days
	},
	...cloudflareApiOptions,
});

const notificationQueue = await Queue("notificationQueue", {
	adopt: true,
	dlq: notificationDeadLetterQueue,
	settings: {
		messageRetentionPeriod: 60 * 60 * 24 * 14, // 14 days
	},
	...cloudflareApiOptions,
});

// Local dev uses localhost ports, deployed stages use their web URL
const devCorsOrigin =
	"http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176";

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
		const base = process.env.CORS_ORIGIN ?? devCorsOrigin;
		// When tunnel is active, also allow the ngrok domain
		const ngrokDomain = process.env.NGROK_DOMAIN_NAME;
		if (shouldStartTunnel && ngrokDomain) {
			return `${base},https://${ngrokDomain}`;
		}
		return base;
	}
	// PR previews - allow all origins
	if (stage.startsWith("pr-")) {
		return "*";
	}
	// Deployed stages - use env or construct from stage name
	return (
		process.env.CORS_ORIGIN ??
		`https://full-stack-cf-app-web-${stage}.smartcache.workers.dev`
	);
};

// Construct auth URL for deployed stages if not set
const getAuthUrl = (): string => {
	if (!isDeploying) {
		return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
	}
	return (
		process.env.BETTER_AUTH_URL ??
		`https://full-stack-cf-app-server-${stage}.smartcache.workers.dev`
	);
};

const getWebhookUrl = (): string => {
	if (process.env.GOOGLE_CALENDAR_WEBHOOK_URL) {
		return process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
	}
	if (!isDeploying && shouldStartTunnel && process.env.NGROK_DOMAIN_NAME) {
		return `https://${process.env.NGROK_DOMAIN_NAME}/server/webhooks/calendar/google`;
	}
	if (isDeploying) {
		return `${getAuthUrl()}/webhooks/calendar/google`;
	}
	return "";
};

export const server = await Worker("server", {
	cwd: "../../apps/server",
	entrypoint: "src/index.ts",
	compatibility: "node",
	...cloudflareApiOptions,
	bindings: {
		DB: db,
		NOTIFICATION_QUEUE: notificationQueue,
		CORS_ORIGIN: getCorsOrigin(),
		BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
		BETTER_AUTH_URL: getAuthUrl(),
		POLAR_ACCESS_TOKEN: alchemy.secret.env(
			"POLAR_ACCESS_TOKEN",
			process.env.POLAR_ACCESS_TOKEN || ""
		),
		POLAR_SUCCESS_URL: process.env.POLAR_SUCCESS_URL || "",
		POLAR_PRODUCT_ID: process.env.POLAR_PRODUCT_ID || "",
		TELEGRAM_BOT_TOKEN: alchemy.secret.env(
			"TELEGRAM_BOT_TOKEN",
			process.env.TELEGRAM_BOT_TOKEN || ""
		),
		TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || "",
		TELEGRAM_BOT_API_BASE_URL: process.env.TELEGRAM_BOT_API_BASE_URL || "",
		GOOGLE_CALENDAR_CREDENTIALS_JSON: alchemy.secret.env(
			"GOOGLE_CALENDAR_CREDENTIALS_JSON",
			process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON || ""
		),
		GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN: alchemy.secret.env(
			"GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN",
			process.env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN || ""
		),
		CALENDAR_SYNC_TASK_TOKEN: alchemy.secret.env(
			"CALENDAR_SYNC_TASK_TOKEN",
			process.env.CALENDAR_SYNC_TASK_TOKEN || ""
		),
		GOOGLE_CALENDAR_WEBHOOK_URL: getWebhookUrl(),
		CLOUDPAYMENTS_PUBLIC_ID:
			process.env.CLOUDPAYMENTS_PUBLIC_ID ||
			process.env.PUBLIC_CLOUDPAYMENTS_PUBLIC_ID ||
			"",
		CLOUDPAYMENTS_API_SECRET: alchemy.secret.env(
			"CLOUDPAYMENTS_API_SECRET",
			process.env.CLOUDPAYMENTS_API_SECRET || ""
		),
		OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY || "",
		AI_MODEL: process.env.AI_MODEL || "",
	},
	dev: { port: 3000 },
});

export const notifications = await Worker("notifications", {
	cwd: "../../apps/notifications",
	entrypoint: "src/index.ts",
	compatibility: "node",
	...cloudflareApiOptions,
	bindings: {
		DB: db,
		CORS_ORIGIN: getCorsOrigin(),
		BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
		BETTER_AUTH_URL: getAuthUrl(),
		TELEGRAM_BOT_TOKEN: alchemy.secret.env(
			"TELEGRAM_BOT_TOKEN",
			process.env.TELEGRAM_BOT_TOKEN || ""
		),
		TELEGRAM_BOT_API_BASE_URL: process.env.TELEGRAM_BOT_API_BASE_URL || "",
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
	dev: { port: 3001 },
});

export const assistant = await Worker("assistant", {
	cwd: "../../apps/assistant",
	entrypoint: "src/index.ts",
	compatibility: "node",
	...cloudflareApiOptions,
	bindings: {
		DB: db,
		CORS_ORIGIN: getCorsOrigin(),
		BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
		BETTER_AUTH_URL: getAuthUrl(),
		OPEN_ROUTER_API_KEY: alchemy.secret.env(
			"OPEN_ROUTER_API_KEY",
			process.env.OPEN_ROUTER_API_KEY || ""
		),
		AI_MODEL: process.env.AI_MODEL || "openai/gpt-4o",
	},
	dev: { port: 3002 },
});

const shouldStartWeb = process.env.ALCHEMY_SKIP_WEB !== "1";

export const web = shouldStartWeb
	? await SvelteKit("web", {
			cwd: "../../apps/web",
			...cloudflareApiOptions,
			bindings: {
				// When tunnel is active, use relative /server so browser API calls
				// go through the ngrok origin (same-origin → /server/rpc)
				PUBLIC_SERVER_URL: shouldStartTunnel ? "/server" : server.url!,
				PUBLIC_ASSISTANT_URL: shouldStartTunnel ? "/assistant" : assistant.url!,
				PUBLIC_BASE_PATH: shouldStartTunnel ? "/web" : "",
				PUBLIC_CLOUDPAYMENTS_PUBLIC_ID:
					process.env.PUBLIC_CLOUDPAYMENTS_PUBLIC_ID || "",
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
	// Ensure previews stay disabled after Alchemy finishes applying resources.
	const api = await createCloudflareApi();
	await Promise.all([
		api.post(
			`/accounts/${api.accountId}/workers/scripts/${appName}-server-${stage}/subdomain`,
			{
				enabled: true,
				previews_enabled: false,
			}
		),
		api.post(
			`/accounts/${api.accountId}/workers/scripts/${appName}-notifications-${stage}/subdomain`,
			{
				enabled: true,
				previews_enabled: false,
			}
		),
		api.post(
			`/accounts/${api.accountId}/workers/scripts/${appName}-assistant-${stage}/subdomain`,
			{
				enabled: true,
				previews_enabled: false,
			}
		),
		api.post(
			`/accounts/${api.accountId}/workers/scripts/${appName}-web-${stage}/subdomain`,
			{
				enabled: true,
				previews_enabled: false,
			}
		),
	]);
}
