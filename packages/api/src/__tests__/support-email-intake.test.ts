import { describe, expect, it } from "vitest";
import { toProcessInboundSupportIntentFromEmail } from "../handlers/internal/support-email-intake";

describe("toProcessInboundSupportIntentFromEmail", () => {
	it("derives a stable external thread id from References first", () => {
		const intent = toProcessInboundSupportIntentFromEmail(
			{
				attachments: [],
				from: { address: "customer@example.com", name: "Customer" },
				headers: {},
				inReplyTo: "<reply@example.com>",
				messageId: "<message@example.com>",
				references: ["<root@example.com>", "<reply@example.com>"],
				subject: "Re: Need help",
				text: "Following up on the booking",
				to: [{ address: "support@example.com" }],
			},
			"org_123"
		);

		expect(intent.externalMessageId).toBe("message@example.com");
		expect(intent.externalThreadId).toBe("root@example.com");
		expect(intent.dedupeKey).toBe("email:message@example.com");
		expect(intent.payload.references).toEqual([
			"root@example.com",
			"reply@example.com",
		]);
	});
});
