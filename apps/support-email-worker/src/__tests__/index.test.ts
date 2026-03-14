import { describe, expect, it, vi } from "vitest";
import {
	forwardSupportInboundEmail,
	handleSupportEmailMessage,
} from "../index";

const rawEmail = `From: "Sample Sender" <sender@example.com>
To: support@example.com
Subject: Sample support email
Message-ID: <sample-message-id@example.com>
Content-Type: text/plain; charset="utf-8"

Hello from the worker test.`;

describe("support email worker", () => {
	it("forwards parsed support email payloads to the configured webhook", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 202 }));

		const payload = await handleSupportEmailMessage(
			{
				from: "sender@example.com",
				headers: new Headers(),
				raw: new Blob([rawEmail]).stream(),
				to: "support@example.com",
			},
			{
				SUPPORT_EMAIL_ALLOWED_RECIPIENTS: "",
				SUPPORT_EMAIL_WEBHOOK_SECRET: "secret",
				SUPPORT_EMAIL_WEBHOOK_URL:
					"https://api.example.com/api/support/inbound/email",
			},
			fetchMock as typeof fetch,
		);

		expect(payload?.messageId).toBe("sample-message-id@example.com");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://api.example.com/api/support/inbound/email");
		expect(init?.headers).toMatchObject({
			"content-type": "application/json",
			"x-support-email-secret": "secret",
		});
	});

	it("rejects mail addressed to recipients outside the configured allow-list", async () => {
		const fetchMock = vi.fn();
		const setReject = vi.fn();

		const payload = await handleSupportEmailMessage(
			{
				from: "sender@example.com",
				headers: new Headers(),
				raw: new Blob([rawEmail]).stream(),
				setReject,
				to: "other@example.com",
			},
			{
				SUPPORT_EMAIL_ALLOWED_RECIPIENTS: "support@example.com",
				SUPPORT_EMAIL_WEBHOOK_SECRET: "secret",
				SUPPORT_EMAIL_WEBHOOK_URL:
					"https://api.example.com/api/support/inbound/email",
			},
			fetchMock as typeof fetch,
		);

		expect(payload).toBeNull();
		expect(setReject).toHaveBeenCalledTimes(1);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("posts serialized JSON payloads with the shared secret header", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 202 }));

		await forwardSupportInboundEmail(
			{
				attachments: [],
				from: { address: "sender@example.com" },
				headers: {},
				messageId: "sample-message-id@example.com",
				references: [],
				subject: "Sample support email",
				text: "Hello",
				to: [{ address: "support@example.com" }],
			},
			{
				SUPPORT_EMAIL_ALLOWED_RECIPIENTS: "",
				SUPPORT_EMAIL_WEBHOOK_SECRET: "secret",
				SUPPORT_EMAIL_WEBHOOK_URL:
					"https://api.example.com/api/support/inbound/email",
			},
			fetchMock as typeof fetch,
		);

		const [, init] = fetchMock.mock.calls[0] ?? [];
		expect(init?.body).toContain("sample-message-id@example.com");
		expect(init?.headers).toMatchObject({
			"x-support-email-secret": "secret",
		});
	});
});
