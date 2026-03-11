import { beforeAll, describe, expect, it } from "vitest";
import { createSmtpEmailProvider } from "../adapters/smtp";

const runIntegration = process.env.SMTP4DEV_INTEGRATION === "1";
const smtpHost = process.env.SMTP4DEV_SMTP_HOST ?? "127.0.0.1";
const smtpPort = Number(process.env.SMTP4DEV_SMTP_PORT ?? "2525");
const smtp4devBaseUrl = (
	process.env.SMTP4DEV_BASE_URL ?? "http://127.0.0.1:5025"
).replace(/\/+$/, "");

interface Smtp4DevMessageListResponse {
	results?: Array<{
		id?: string;
		subject?: string;
	}>;
}

const smtp4devAvailable = async (): Promise<boolean> => {
	try {
		const response = await fetch(`${smtp4devBaseUrl}/api/messages`);
		return response.ok;
	} catch {
		return false;
	}
};

describe.skipIf(!runIntegration)("SmtpEmailProvider integration", () => {
	beforeAll(async () => {
		if (!(await smtp4devAvailable())) {
			throw new Error(
				`smtp4dev API is unavailable at ${smtp4devBaseUrl}. Start docker compose smtp-server first.`
			);
		}
	});

	it("delivers SMTP messages that appear in smtp4dev", async () => {
		const subject = `smtp4dev-integration-${Date.now()}`;
		const provider = createSmtpEmailProvider({
			defaultFrom: {
				address: "noreply@example.com",
				name: "Integration Tests",
			},
			host: smtpHost,
			ignoreTls: true,
			port: smtpPort,
			providerId: "smtp-integration",
			secure: false,
		});

		const result = await provider.sendEmail({
			subject,
			text: "Hello from SMTP integration",
			to: [{ address: "recipient@example.com" }],
		});

		expect(result.accepted).toContain("recipient@example.com");

		const message = await pollForMessage(subject);
		expect(message?.subject).toBe(subject);
	});
});

const pollForMessage = async (
	subject: string
): Promise<{ id?: string; subject?: string } | null> => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const response = await fetch(`${smtp4devBaseUrl}/api/messages`);
		if (!response.ok) {
			throw new Error(
				`smtp4dev list request failed: ${response.status} ${response.statusText}`
			);
		}

		const payload = (await response.json()) as Smtp4DevMessageListResponse;
		const match =
			payload.results?.find((message) => message.subject === subject) ?? null;
		if (match) {
			return match;
		}

		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	return null;
};
