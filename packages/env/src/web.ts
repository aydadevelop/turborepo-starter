import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Vite/SvelteKit exposes env vars via import.meta.env
const runtimeEnv = (import.meta as ImportMeta & { env: Record<string, string> })
	.env;

export const env = createEnv({
	clientPrefix: "PUBLIC_",
	client: {
		PUBLIC_SERVER_URL: z.string().min(1),
		PUBLIC_ASSISTANT_URL: z.string().optional(),
		PUBLIC_BASE_PATH: z.string().optional(),
		PUBLIC_CLOUDPAYMENTS_PUBLIC_ID: z.string().optional(),
	},
	runtimeEnv,
	emptyStringAsUndefined: true,
});
