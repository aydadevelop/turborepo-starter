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
			STORAGE_BACKEND?: "local-file" | "s3";
			STORAGE_LOCAL_DIR?: string;
			STORAGE_PUBLIC_BASE_URL?: string;
			STORAGE_S3_ACCESS_KEY_ID?: string;
			STORAGE_S3_BUCKET?: string;
			STORAGE_S3_ENDPOINT?: string;
			STORAGE_S3_FORCE_PATH_STYLE?: "0" | "1";
			STORAGE_S3_REGION?: string;
			STORAGE_S3_SECRET_ACCESS_KEY?: string;
			STORAGE_SIGNED_URL_TTL_SECONDS?: string;
			TELEGRAM_BOT_API_BASE_URL?: string;
			TELEGRAM_BOT_TOKEN?: string;
			TELEGRAM_BOT_USERNAME?: string;
		}
	}
}
