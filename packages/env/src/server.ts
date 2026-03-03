import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { baseCloudflareServerSchema } from "./common";

// Validate and export typed environment variables
export const env = createEnv({
	server: {
		...baseCloudflareServerSchema,
		DATABASE_URL: z
			.string()
			.min(1, "DATABASE_URL is required")
			.default("postgresql://postgres:postgres@localhost:5432/myapp"),
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
	runtimeEnv: process.env,
	emptyStringAsUndefined: false, // Keep empty strings for optional vars
});
