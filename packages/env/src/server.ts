/// <reference path="../env.d.ts" />

import { env as cfEnv } from "cloudflare:workers";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Extract string env vars for validation (excludes DB binding)
const stringEnvVars = {
	CORS_ORIGIN: cfEnv.CORS_ORIGIN,
	BETTER_AUTH_SECRET: cfEnv.BETTER_AUTH_SECRET,
	BETTER_AUTH_URL: cfEnv.BETTER_AUTH_URL,
	POLAR_ACCESS_TOKEN: cfEnv.POLAR_ACCESS_TOKEN,
	POLAR_SUCCESS_URL: cfEnv.POLAR_SUCCESS_URL,
	POLAR_PRODUCT_ID: cfEnv.POLAR_PRODUCT_ID,
	TELEGRAM_BOT_TOKEN: cfEnv.TELEGRAM_BOT_TOKEN,
	TELEGRAM_BOT_USERNAME: cfEnv.TELEGRAM_BOT_USERNAME,
	TELEGRAM_BOT_API_BASE_URL: cfEnv.TELEGRAM_BOT_API_BASE_URL,
	GOOGLE_CALENDAR_CREDENTIALS_JSON: cfEnv.GOOGLE_CALENDAR_CREDENTIALS_JSON,
	GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN:
		cfEnv.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN,
	CALENDAR_SYNC_TASK_TOKEN: cfEnv.CALENDAR_SYNC_TASK_TOKEN,
	CLOUDPAYMENTS_PUBLIC_ID: cfEnv.CLOUDPAYMENTS_PUBLIC_ID,
	CLOUDPAYMENTS_API_SECRET: cfEnv.CLOUDPAYMENTS_API_SECRET,
	OPEN_ROUTER_API_KEY: cfEnv.OPEN_ROUTER_API_KEY,
	AI_MODEL: cfEnv.AI_MODEL,
};

// Validate and export typed environment variables
export const env = {
	...createEnv({
		server: {
			// Required
			CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
			BETTER_AUTH_SECRET: z
				.string()
				.min(16, "BETTER_AUTH_SECRET must be at least 16 characters"),
			BETTER_AUTH_URL: z.url("BETTER_AUTH_URL must be a valid URL"),
			// Optional - empty string means disabled
			POLAR_ACCESS_TOKEN: z.string().default(""),
			POLAR_SUCCESS_URL: z.string().default(""),
			POLAR_PRODUCT_ID: z.string().default(""),
			TELEGRAM_BOT_TOKEN: z.string().default(""),
			TELEGRAM_BOT_USERNAME: z.string().default(""),
			TELEGRAM_BOT_API_BASE_URL: z.string().default(""),
			GOOGLE_CALENDAR_CREDENTIALS_JSON: z.string().default(""),
			GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN: z.string().default(""),
			CALENDAR_SYNC_TASK_TOKEN: z.string().default(""),
			CLOUDPAYMENTS_PUBLIC_ID: z.string().default(""),
			CLOUDPAYMENTS_API_SECRET: z.string().default(""),
			OPEN_ROUTER_API_KEY: z.string().default(""),
			AI_MODEL: z.string().default(""),
		},
		runtimeEnv: stringEnvVars,
		emptyStringAsUndefined: false, // Keep empty strings for optional vars
	}),
	// D1 database binding (passed through without validation)
	DB: cfEnv.DB,
};
