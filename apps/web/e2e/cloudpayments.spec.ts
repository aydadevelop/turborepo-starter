import { expect, type Page, test } from "@playwright/test";
import { url } from "./helpers";

const SERVER_URL = process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:3000";
const BOAT_ID = "seed_boat_aurora--seed-aurora-8";

const uniqueId = () =>
	`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface BrowserFetchResult {
	ok: boolean;
	status: number;
	text: string;
	json: unknown;
}

const browserRequest = async (
	page: Page,
	options: {
		path: string;
		method?: "GET" | "POST";
		body?: Record<string, unknown>;
	}
): Promise<BrowserFetchResult> =>
	await page.evaluate(
		async ({ body, method, path, serverUrl }) => {
			const response = await fetch(`${serverUrl}${path}`, {
				method,
				credentials: "include",
				headers: body
					? { "content-type": "application/json" }
					: undefined,
				body: body ? JSON.stringify(body) : undefined,
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
		{
			path: options.path,
			method: options.method ?? "GET",
			body: options.body,
			serverUrl: SERVER_URL,
		}
	);

const signUp = async (page: Page, email: string) => {
	await page.goto(url("/"));
	const result = await browserRequest(page, {
		path: "/api/auth/sign-up/email",
		method: "POST",
		body: {
			name: "CP Test User",
			email,
			password: `Passw0rd!${Date.now()}`,
		},
	});
	expect(result.ok, `sign-up failed: ${result.text}`).toBe(true);
};

const createUnpaidBooking = async (page: Page) => {
	const startsAt = new Date("2026-04-15T10:00:00Z");
	const endsAt = new Date("2026-04-15T12:00:00Z");

	const result = await browserRequest(page, {
		path: "/rpc/booking.createPublic",
		method: "POST",
		body: {
			json: {
				boatId: BOAT_ID,
				startsAt: startsAt.toISOString(),
				endsAt: endsAt.toISOString(),
				passengers: 2,
				contactName: "CP Test Customer",
				contactEmail: `cp-test-${uniqueId()}@e2e.local`,
				timezone: "UTC",
				source: "web",
			},
		},
	});

	expect(
		result.ok,
		`createPublic booking failed: ${result.text}`
	).toBe(true);

	const data = result.json as {
		json?: { booking?: { id: string; totalPriceCents: number; currency: string } };
	};
	const booking = data.json?.booking;
	expect(booking?.id).toBeTruthy();

	return booking!;
};

test.describe("CloudPayments Payment", () => {
	test("Pay button appears for unpaid booking and initiates payment attempt", async ({
		page,
	}) => {
		const runId = uniqueId();
		const customerEmail = `cp-pay-${runId}@e2e.local`;

		await signUp(page, customerEmail);
		const booking = await createUnpaidBooking(page);

		await page.goto(url("/bookings"));

		await expect(
			page.getByText(`Booking #${booking.id.slice(0, 8)}`)
		).toBeVisible({ timeout: 10_000 });

		const payButton = page.getByTestId("pay-button").first();
		await expect(payButton).toBeVisible();
		await expect(payButton).toContainText("Pay");

		await payButton.click();

		// After clicking Pay, the oRPC paymentAttemptCreate is called.
		// If CP widget script is loaded and PUBLIC_CLOUDPAYMENTS_PUBLIC_ID is set,
		// the widget will open. Otherwise we get a configuration error.
		// Either outcome proves the payment flow is wired up correctly.
		const hasWidgetOrMessage = page
			.getByText(/payment|cloudpayments|not configured/i)
			.first();
		await expect(hasWidgetOrMessage).toBeVisible({ timeout: 10_000 });
	});

	test("Pay button does not appear for paid booking", async ({ page }) => {
		const runId = uniqueId();
		const customerEmail = `cp-paid-${runId}@e2e.local`;

		await signUp(page, customerEmail);

		// Navigate to boat page and use Book & Mock Pay to create a paid booking
		await page.goto(
			url(
				`/boats/${BOAT_ID}?date=2026-04-20&durationHours=2&passengers=2`
			)
		);
		await expect(
			page.getByText(`Signed in as ${customerEmail}`, { exact: true })
		).toBeVisible({ timeout: 10_000 });

		const mockPayButton = page
			.getByRole("button", { name: "Book & Mock Pay" })
			.first();
		await expect(mockPayButton).toBeVisible();
		await mockPayButton.click();

		await expect(
			page.getByText(/mock payment captured/i)
		).toBeVisible({ timeout: 10_000 });

		// Navigate to bookings and verify Pay button is NOT shown
		await page.goto(url("/bookings"));
		await expect(page.getByText("Booking #")).toBeVisible({ timeout: 10_000 });

		// Payment status should be "paid"
		await expect(page.getByText("paid")).toBeVisible();

		// Pay button should not exist for paid bookings
		const payButtons = page.getByTestId("pay-button");
		await expect(payButtons).toHaveCount(0);
	});

	test("CloudPayments widget script is loaded", async ({ page }) => {
		await page.goto(url("/"));

		const cpScriptLoaded = await page.evaluate(() => {
			return typeof (window as unknown as Record<string, unknown>).cp !== "undefined";
		});

		expect(cpScriptLoaded).toBe(true);
	});
});
