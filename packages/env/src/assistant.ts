import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { baseCloudflareServerSchema } from "./common";

export const env = {
	...createEnv({
		server: {
			...baseCloudflareServerSchema,
			DATABASE_URL: z
				.string()
				.min(1, "DATABASE_URL is required")
				.default("postgresql://postgres:postgres@localhost:5432/myapp"),
			OPEN_ROUTER_API_KEY: z.string().min(1, "OPEN_ROUTER_API_KEY is required"),
			AI_MODEL: z.string().default("openai/gpt-5-nano:nitro"),
			SERVER_URL: z.string().url("SERVER_URL must be a valid URL"),
		},
		runtimeEnv: process.env,
		emptyStringAsUndefined: true,
	}),
};
