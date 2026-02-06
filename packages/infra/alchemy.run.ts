import alchemy from "alchemy";
import {
	createCloudflareApi,
	D1Database,
	disableWorkerSubdomain,
	SvelteKit,
	Worker,
} from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { config } from "dotenv";

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
const envPath = isDeploying ? ".production" : "";
config({ path: `../../apps/server/.env${envPath}` });
config({ path: "./.env" });

if (isDeployCommand) {
	// Cloudflare rejects script uploads with DO migration metadata when previews are enabled.
	// Disable previews before upload; Alchemy will re-enable the stage URL after deploy.
	const api = await createCloudflareApi();
	await Promise.all([
		disableWorkerSubdomain(api, `${appName}-server-${stage}`),
		disableWorkerSubdomain(api, `${appName}-web-${stage}`),
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
});

// Local dev uses localhost ports, deployed stages use their web URL
const devCorsOrigin =
	"http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176";

const getCorsOrigin = (): string => {
	// Local development - use localhost origins
	if (!isDeploying) {
		return process.env.CORS_ORIGIN ?? devCorsOrigin;
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

export const server = await Worker("server", {
	cwd: "../../apps/server",
	entrypoint: "src/index.ts",
	compatibility: "node",
	bindings: {
		DB: db,
		CORS_ORIGIN: getCorsOrigin(),
		BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
		BETTER_AUTH_URL: getAuthUrl(),
		OPEN_ROUTER_API_KEY: alchemy.secret.env.OPEN_ROUTER_API_KEY ?? "",
		POLAR_ACCESS_TOKEN: alchemy.secret.env.POLAR_ACCESS_TOKEN ?? "",
		POLAR_SUCCESS_URL: alchemy.env("POLAR_SUCCESS_URL") ?? "",
		POLAR_PRODUCT_ID: alchemy.env("POLAR_PRODUCT_ID") ?? "",
	},
	dev: { port: 3000 },
});

export const web = await SvelteKit("web", {
	cwd: "../../apps/web",
	bindings: { PUBLIC_SERVER_URL: server.url! },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
