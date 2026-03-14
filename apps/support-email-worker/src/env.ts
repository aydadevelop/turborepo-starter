import { z } from "zod";

const supportEmailWorkerEnvSchema = z.object({
	SUPPORT_EMAIL_ALLOWED_RECIPIENTS: z.string().default(""),
	SUPPORT_EMAIL_WEBHOOK_SECRET: z.string().min(1),
	SUPPORT_EMAIL_WEBHOOK_URL: z.url(),
});

export type SupportEmailWorkerEnv = z.infer<typeof supportEmailWorkerEnvSchema>;

export const parseSupportEmailWorkerEnv = (
	env: unknown,
): SupportEmailWorkerEnv => supportEmailWorkerEnvSchema.parse(env);

export const parseAllowedRecipients = (value: string): string[] =>
	value
		.split(",")
		.map((entry) => entry.trim().toLowerCase())
		.filter((entry) => entry.length > 0);
