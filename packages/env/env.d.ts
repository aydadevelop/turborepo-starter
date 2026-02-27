// Keep this declaration lightweight and local so env typing does not pull
// infrastructure runtime modules into every TypeScript project.
export type CloudflareEnv = {
  DB: D1Database;
  SERVER_WORKER: Fetcher;
  CORS_ORIGIN?: string;
  BETTER_AUTH_SECRET?: string;
  SERVER_URL?: string;
  BETTER_AUTH_URL?: string;
  OPEN_ROUTER_API_KEY?: string;
  AI_MODEL?: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_SUCCESS_URL?: string;
  POLAR_PRODUCT_ID?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_BOT_API_BASE_URL?: string;
  CLOUDPAYMENTS_PUBLIC_ID?: string;
  CLOUDPAYMENTS_API_SECRET?: string;
  PUBLIC_SERVER_URL?: string;
  PUBLIC_ASSISTANT_URL?: string;
  PUBLIC_BASE_PATH?: string;
  PUBLIC_CLOUDPAYMENTS_PUBLIC_ID?: string;
  [key: string]: unknown;
};

declare global {
	type Env = CloudflareEnv;
}

declare module "cloudflare:workers" {
	export const env: CloudflareEnv;

	namespace Cloudflare {
		export interface Env extends CloudflareEnv {}
	}
}
