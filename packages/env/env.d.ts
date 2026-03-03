// Environment type declarations.
// These are lightweight placeholders — real validation happens in @t3-oss/env-core.

export {};

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			AI_MODEL?: string;
			BETTER_AUTH_SECRET?: string;
			BETTER_AUTH_URL?: string;
			CLOUDPAYMENTS_API_SECRET?: string;
			CLOUDPAYMENTS_PUBLIC_ID?: string;
			CORS_ORIGIN?: string;
			DATABASE_URL?: string;
			OPEN_ROUTER_API_KEY?: string;
			POLAR_ACCESS_TOKEN?: string;
			POLAR_PRODUCT_ID?: string;
			POLAR_SUCCESS_URL?: string;
			SERVER_URL?: string;
			TELEGRAM_BOT_API_BASE_URL?: string;
			TELEGRAM_BOT_TOKEN?: string;
			TELEGRAM_BOT_USERNAME?: string;
		}
	}
}
