/// <reference path="../env.d.ts" />

import { env as cfEnv } from "cloudflare:workers";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import {
	baseCloudflareServerSchema,
	pickBaseCloudflareRuntimeEnv,
} from "./common";

// Extract string env vars for validation (excludes DB binding)
const stringEnvVars = {
	...pickBaseCloudflareRuntimeEnv(cfEnv),
	TELEGRAM_BOT_TOKEN: cfEnv.TELEGRAM_BOT_TOKEN,
	TELEGRAM_BOT_USERNAME: cfEnv.TELEGRAM_BOT_USERNAME,
	TELEGRAM_BOT_API_BASE_URL: cfEnv.TELEGRAM_BOT_API_BASE_URL,
	CLOUDPAYMENTS_PUBLIC_ID: cfEnv.CLOUDPAYMENTS_PUBLIC_ID,
	CLOUDPAYMENTS_API_SECRET: cfEnv.CLOUDPAYMENTS_API_SECRET,
};

// Validate and export typed environment variables
export const env = {
	...createEnv({
		server: {
			...baseCloudflareServerSchema,
			// Optional - empty string means disabled
			POLAR_ACCESS_TOKEN: z.string().default(""),
			POLAR_SUCCESS_URL: z.string().default(""),
			POLAR_PRODUCT_ID: z.string().default(""),
			TELEGRAM_BOT_TOKEN: z.string().default(""),
			TELEGRAM_BOT_USERNAME: z.string().default(""),
			TELEGRAM_BOT_API_BASE_URL: z.string().default(""),
			CLOUDPAYMENTS_PUBLIC_ID: z.string().default(""),
			CLOUDPAYMENTS_API_SECRET: z.string().default(""),
		},
		runtimeEnv: stringEnvVars,
		emptyStringAsUndefined: false, // Keep empty strings for optional vars
	}),
	// D1 database binding (passed through without validation)
	DB: cfEnv.DB,
};
