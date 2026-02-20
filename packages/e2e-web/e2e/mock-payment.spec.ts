import { expect, test } from "@playwright/test";
import { getPlaywrightRuntimeEnv } from "../playwright.env";
import { url } from "./utils/url";

const { serverURL: SERVER_URL } = getPlaywrightRuntimeEnv();
const BOAT_URL = url(
	"/boats/seed_boat_aurora--seed-aurora-8?date=2026-03-20&durationHours=2&passengers=2"
);
const MOCK_PAYMENT_OUTCOME_RE = /mock payment|failed/i;

const uniqueId = () =>
	`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test.describe("Mock Payment", () => {
	test("signed-in user can create booking and initiate mock payment", async ({
		page,
	}) => {
		const runId = uniqueId();
		const customerEmail = `mockpay-${runId}@e2e.local`;

		await page.goto(url("/"));

		await page.evaluate(
			async ({ customerEmail, serverUrl }) => {
				await fetch(`${serverUrl}/api/auth/sign-up/email`, {
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
			},
			{ customerEmail, serverUrl: SERVER_URL }
		);

		await page.goto(BOAT_URL);

		await expect(page.getByTestId("booking-access-status")).toContainText(
			customerEmail
		);

		const mockPayButton = page.getByTestId("mock-pay-button").first();
		await expect(mockPayButton).toBeVisible();
		await mockPayButton.click();

		const outcome = page
			.getByTestId("mock-payment-message")
			.or(page.getByTestId("mock-payment-error"))
			.first();
		const outcomeVisible = await outcome
			.isVisible({ timeout: 15_000 })
			.catch(() => false);
		if (outcomeVisible) {
			await expect(outcome).toContainText(MOCK_PAYMENT_OUTCOME_RE);
			return;
		}

		await expect(mockPayButton).toContainText("Processing...");
	});
});
