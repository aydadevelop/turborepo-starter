import { describe, expect, it } from "vitest";
import { buildSupportInboundEmailPayload } from "../normalize";

const fixture = `Received: from smtp.example.com (127.0.0.1)
by cloudflare-email.com (unknown) id reply123
for <support@example.com>; Wed, 11 Mar 2026 12:00:00 +0000
From: "Sample Sender" <sender@example.com>
To: support@example.com
Subject: Re: Sample support email
Content-Type: text/plain; charset="utf-8"
Date: Wed, 11 Mar 2026 12:00:00 +0000
Message-ID: <reply-message-id@example.com>
In-Reply-To: <root-message-id@example.com>
References: <root-message-id@example.com> <reply-message-id@example.com>

Hello from a reply.`;

describe("buildSupportInboundEmailPayload", () => {
	it("parses sender, recipients, and threading headers from a raw email", async () => {
		const payload = await buildSupportInboundEmailPayload({
			from: "sender@example.com",
			headers: new Headers({
				"content-type": "text/plain; charset=utf-8",
				"message-id": "<reply-message-id@example.com>",
			}),
			raw: new Blob([fixture]).stream(),
			to: "support@example.com",
		});

		expect(payload.from.address).toBe("sender@example.com");
		expect(payload.from.name).toBe("Sample Sender");
		expect(payload.to).toEqual([{ address: "support@example.com" }]);
		expect(payload.messageId).toBe("reply-message-id@example.com");
		expect(payload.inReplyTo).toBe("root-message-id@example.com");
		expect(payload.references[0]).toBe("root-message-id@example.com");
		expect(payload.subject).toBe("Re: Sample support email");
		expect(payload.text).toContain("Hello from a reply.");
	});
});
