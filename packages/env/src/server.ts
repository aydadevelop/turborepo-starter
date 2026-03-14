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
		EMAIL_BACKEND: z.enum(["fake", "smtp"]).default("fake"),
		EMAIL_FROM_ADDRESS: z.string().default("noreply@localhost"),
		EMAIL_FROM_NAME: z.string().default("My App"),
		EMAIL_REPLY_TO: z.string().default(""),
		SMTP_HOST: z.string().default(""),
		SMTP_PORT: z.coerce.number().int().positive().default(25),
		SMTP_SECURE: z.enum(["0", "1"]).default("0"),
		SMTP_IGNORE_TLS: z.enum(["0", "1"]).default("0"),
		SMTP_USER: z.string().default(""),
		SMTP_PASS: z.string().default(""),
		SUPPORT_EMAIL_INTAKE_SECRET: z.string().default(""),
		SUPPORT_EMAIL_INTAKE_ORGANIZATION_ID: z.string().default(""),
		GOOGLE_CALENDAR_CREDENTIALS_JSON: z.string().default(""),
		GOOGLE_SERVICE_ACCOUNT_KEY: z.string().default(""),
		GOOGLE_CLIENT_ID: z.string().default(""),
		GOOGLE_CLIENT_SECRET: z.string().default(""),
		STORAGE_BACKEND: z.enum(["local-file", "s3"]).default("local-file"),
		STORAGE_PUBLIC_BASE_URL: z.string().default(""),
		STORAGE_LOCAL_DIR: z.string().default("./.data/storage/listing-public-v1"),
		STORAGE_S3_ENDPOINT: z.string().default(""),
		STORAGE_S3_REGION: z.string().default("us-east-1"),
		STORAGE_S3_BUCKET: z.string().default(""),
		STORAGE_S3_ACCESS_KEY_ID: z.string().default(""),
		STORAGE_S3_SECRET_ACCESS_KEY: z.string().default(""),
		STORAGE_S3_FORCE_PATH_STYLE: z.enum(["0", "1"]).default("0"),
		STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce
			.number()
			.int()
			.positive()
			.default(900),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: false, // Keep empty strings for optional vars
});
