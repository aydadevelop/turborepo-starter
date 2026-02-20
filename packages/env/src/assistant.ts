/// <reference path="../env.d.ts" />

import { env as cfEnv } from "cloudflare:workers";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import {
	baseCloudflareServerSchema,
	pickBaseCloudflareRuntimeEnv,
} from "./common";

export const env = {
	...createEnv({
		server: {
			...baseCloudflareServerSchema,
			OPEN_ROUTER_API_KEY: z.string().min(1, "OPEN_ROUTER_API_KEY is required"),
			AI_MODEL: z.string().default("openai/gpt-4o"),
		},
		runtimeEnv: {
			...pickBaseCloudflareRuntimeEnv(cfEnv),
			OPEN_ROUTER_API_KEY: cfEnv.OPEN_ROUTER_API_KEY,
			AI_MODEL: cfEnv.AI_MODEL,
		},
		emptyStringAsUndefined: true,
	}),
	DB: cfEnv.DB,
	SERVER_WORKER: cfEnv.SERVER_WORKER,
};
