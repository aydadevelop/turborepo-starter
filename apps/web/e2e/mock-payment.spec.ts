import { expect, test } from "@playwright/test";
import { url } from "./helpers";

const SERVER_URL = process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:3000";
const BOAT_URL = url(
	"/boats/seed_boat_aurora--seed-aurora-8?date=2026-03-20&durationHours=2&passengers=2"
);
const SLOT_ACTION_NAME = "Book & Mock Pay";
const MOCK_PAYMENT_SUCCESS_TEXT_RE = /mock payment captured/i;

const uniqueId = () =>
	`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test.describe("Mock Payment", () => {
	test("signed-in user can create booking and capture mock payment", async ({
		page,
	}) => {
		const runId = uniqueId();
		const customerEmail = `mockpay-${runId}@e2e.local`;

		await page.goto(url("/"));

		const signUpResult = await page.evaluate(
			async ({ customerEmail, serverUrl }) => {
				const response = await fetch(`${serverUrl}/api/auth/sign-up/email`, {
					method: "POST",
					credentials: "include",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						name: "Mock Payment User",
						email: customerEmail,
						password: `Passw0rd!${Date.now()}`,
					}),
				});

				const text = await response.text();
				let json: unknown = null;
				if (text.length > 0) {
					try {
						json = JSON.parse(text);
					} catch {
						json = null;
					}
				}

				return { ok: response.ok, status: response.status, text, json };
			},
			{ customerEmail, serverUrl: SERVER_URL }
		);

		expect(signUpResult.ok).toBe(true);
		expect(signUpResult.status).toBe(200);

		await page.goto(BOAT_URL);

		await expect(
			page.getByText(`Signed in as ${customerEmail}`, { exact: true })
		).toBeVisible();

		const mockPayButton = page
			.getByRole("button", { name: SLOT_ACTION_NAME })
			.first();
		await expect(mockPayButton).toBeVisible();
		await mockPayButton.click();

		await expect(page.getByText(MOCK_PAYMENT_SUCCESS_TEXT_RE)).toBeVisible();
	});
});
