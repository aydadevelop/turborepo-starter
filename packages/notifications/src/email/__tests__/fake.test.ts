import { describe, expect, it } from "vitest";
import { createFakeEmailProvider } from "../adapters/fake";

describe("FakeEmailProvider", () => {
	it("records accepted messages for fast unit tests", async () => {
		const provider = createFakeEmailProvider();

		const result = await provider.sendEmail({
			subject: "Test message",
			text: "Hello from FakeEmailProvider",
			to: [{ address: "user@example.com" }],
		});

		expect(result.accepted).toEqual(["user@example.com"]);
		expect(result.rejected).toEqual([]);
		expect(provider.sent).toHaveLength(1);
		expect(provider.sent[0]?.message.text).toBe("Hello from FakeEmailProvider");
	});
});
