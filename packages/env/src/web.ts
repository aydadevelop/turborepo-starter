import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

interface ImportMeta {
	env: Record<string, string | undefined>;
}

export const env = createEnv({
	clientPrefix: "PUBLIC_",
	client: {
		PUBLIC_SERVER_URL: z.url(),
	},
	runtimeEnv: (import.meta as ImportMeta).env,
	emptyStringAsUndefined: true,
});
