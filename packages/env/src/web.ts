import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Vite/SvelteKit exposes env vars via import.meta.env
const runtimeEnv = (import.meta as ImportMeta & { env: Record<string, string> })
	.env;

export const env = createEnv({
	clientPrefix: "PUBLIC_",
	client: {
		PUBLIC_SERVER_URL: z.url(),
	},
	runtimeEnv,
	emptyStringAsUndefined: true,
});
