// Keep this declaration lightweight and local so env typing does not pull
// infrastructure runtime modules into every TypeScript project.
export interface CloudflareEnv {
	AI_MODEL?: string;
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_URL?: string;
	CLOUDPAYMENTS_API_SECRET?: string;
	CLOUDPAYMENTS_PUBLIC_ID?: string;
	CORS_ORIGIN?: string;
	DB: D1Database;
	OPEN_ROUTER_API_KEY?: string;
	POLAR_ACCESS_TOKEN?: string;
	POLAR_PRODUCT_ID?: string;
	POLAR_SUCCESS_URL?: string;
	PUBLIC_ASSISTANT_URL?: string;
	PUBLIC_BASE_PATH?: string;
	PUBLIC_CLOUDPAYMENTS_PUBLIC_ID?: string;
	PUBLIC_SERVER_URL?: string;
	SERVER_URL?: string;
	SERVER_WORKER: Fetcher;
	TELEGRAM_BOT_API_BASE_URL?: string;
	TELEGRAM_BOT_TOKEN?: string;
	TELEGRAM_BOT_USERNAME?: string;
	[key: string]: unknown;
}

declare global {
	type Env = CloudflareEnv;
}

declare module "cloudflare:workers" {
	export const env: CloudflareEnv;

	namespace Cloudflare {
		export interface Env extends CloudflareEnv {}
	}
}
