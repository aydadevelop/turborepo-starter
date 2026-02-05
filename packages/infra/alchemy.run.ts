import alchemy from "alchemy";
import { D1Database, SvelteKit, Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { config } from "dotenv";

// Parse --stage from CLI or default to "dev"
const stageIndex = process.argv.indexOf("--stage");
const stage =
	(stageIndex !== -1 ? process.argv[stageIndex + 1] : undefined) ??
	process.env.STAGE ??
	"dev";
const isLocal = stage === "dev";

// Load environment files (later files don't override earlier ones)
const envPath = isLocal ? "" : ".production";
config({ path: `../../apps/server/.env${envPath}` });
config({ path: "./.env" });
config({ path: "../../.env" }); // Root .env as fallback

const app = await alchemy("full-stack-cf-app", {
	stage,
	stateStore: process.env.ALCHEMY_STATE_TOKEN
		? (scope) => new CloudflareStateStore(scope)
		: undefined,
});

const db = await D1Database(`database-${stage}`, {
	migrationsDir: "../../packages/db/src/migrations",
});

// Local dev uses default localhost ports, otherwise use env value
const devCorsOrigin =
	"http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176";

const getCorsOrigin = (): string => {
	if (isLocal) {
		return process.env.CORS_ORIGIN ?? devCorsOrigin;
	}
	if (stage.startsWith("pr-")) {
		return "*";
	}
	return process.env.CORS_ORIGIN ?? "*";
};

export const server = await Worker(`server-${stage}`, {
	cwd: "../../apps/server",
	entrypoint: "src/index.ts",
	compatibility: "node",
	bindings: {
		DB: db,
		CORS_ORIGIN: getCorsOrigin(),
		BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
		BETTER_AUTH_URL: alchemy.env("BETTER_AUTH_URL"),
		OPEN_ROUTER_API_KEY: alchemy.secret.env.OPEN_ROUTER_API_KEY ?? "",
		POLAR_ACCESS_TOKEN: alchemy.secret.env.POLAR_ACCESS_TOKEN ?? "",
		POLAR_SUCCESS_URL: alchemy.env("POLAR_SUCCESS_URL") ?? "",
		POLAR_PRODUCT_ID: alchemy.env("POLAR_PRODUCT_ID") ?? "",
	},
	dev: { port: 3000 },
});

export const web = await SvelteKit(`web-${stage}`, {
	cwd: "../../apps/web",
	bindings: { PUBLIC_SERVER_URL: server.url! },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
