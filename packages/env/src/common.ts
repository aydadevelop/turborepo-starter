import { z } from "zod";

export const baseCloudflareServerSchema = {
	CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
	BETTER_AUTH_SECRET: z
		.string()
		.min(16, "BETTER_AUTH_SECRET must be at least 16 characters"),
	SERVER_URL: z.string().url("SERVER_URL must be a valid URL"),
	BETTER_AUTH_URL: z.string().url("BETTER_AUTH_URL must be a valid URL"),
} as const;

export const pickBaseCloudflareRuntimeEnv = (
	runtime: Record<string, unknown>
) => ({
	CORS_ORIGIN: runtime.CORS_ORIGIN as string | undefined,
	BETTER_AUTH_SECRET: runtime.BETTER_AUTH_SECRET as string | undefined,
	SERVER_URL: runtime.SERVER_URL as string | undefined,
	BETTER_AUTH_URL: runtime.BETTER_AUTH_URL as string | undefined,
});
