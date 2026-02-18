/// <reference path="../env.d.ts" />

import { env as cfEnv } from "cloudflare:workers";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = {
	...createEnv({
		server: {
			CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
			BETTER_AUTH_SECRET: z
				.string()
				.min(16, "BETTER_AUTH_SECRET must be at least 16 characters"),
			BETTER_AUTH_URL: z.url("BETTER_AUTH_URL must be a valid URL"),
			OPEN_ROUTER_API_KEY: z.string().min(1, "OPEN_ROUTER_API_KEY is required"),
			AI_MODEL: z.string().default("openai/gpt-4o"),
		},
		runtimeEnv: {
			CORS_ORIGIN: cfEnv.CORS_ORIGIN,
			BETTER_AUTH_SECRET: cfEnv.BETTER_AUTH_SECRET,
			BETTER_AUTH_URL: cfEnv.BETTER_AUTH_URL,
			OPEN_ROUTER_API_KEY: cfEnv.OPEN_ROUTER_API_KEY,
			AI_MODEL: cfEnv.AI_MODEL,
		},
		emptyStringAsUndefined: true,
	}),
	DB: cfEnv.DB,
};
