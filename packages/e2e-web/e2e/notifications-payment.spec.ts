import { expect, test } from "./fixtures";
import { rpcRequest } from "./utils/auth";
import { url } from "./utils/url";

interface RpcEnvelope<T> {
	json: T;
}

interface PaymentProvider {
	configured: boolean;
	provider: string;
	supportedWebhookTypes: string[];
}

interface PaymentMockChargeResult {
	eventIdempotencyKey: string;
	queued: boolean;
}

interface InAppNotificationItem {
	body: string | null;
	title: string;
}

interface NotificationListResult {
	items: InAppNotificationItem[];
	unread: number;
}

test.describe("Payments & Notifications", () => {
	test("mock payment creates an in-app notification", async ({
		adminPage: page,
	}) => {
		await page.goto(url("/"));

		const providersResult = await rpcRequest(page, {
			path: "payments/providers",
		});
		expect(providersResult.status).toBe(200);
		const providersBody = providersResult.json as RpcEnvelope<
			PaymentProvider[]
		>;
		expect(
			providersBody.json.some((item) => item.provider === "cloudpayments")
		).toBe(true);

		const marker = `e2e-payment-${Date.now()}`;
		const createResult = await rpcRequest(page, {
			path: "payments/createMockChargeNotification",
			input: {
				amountCents: 12_345,
				currency: "USD",
				description: marker,
			},
		});
		expect(createResult.status).toBe(200);
		const createBody =
			createResult.json as RpcEnvelope<PaymentMockChargeResult>;
		expect(createBody.json.queued).toBe(true);
		expect(createBody.json.eventIdempotencyKey).toContain(
			"payment.mock.charge"
		);

		await expect
			.poll(
				async () => {
					const notificationsResult = await rpcRequest(page, {
						path: "notifications/listMe",
						input: { limit: 20 },
					});
					if (!notificationsResult.ok) {
						return false;
					}

					const notificationsBody =
						notificationsResult.json as RpcEnvelope<NotificationListResult>;
					return notificationsBody.json.items.some(
						(item) =>
							item.title.includes("Payment succeeded:") &&
							item.body?.includes(marker) === true
					);
				},
				{
					timeout: 20_000,
					intervals: [500, 1000, 1500, 2000],
				}
			)
			.toBe(true);
	});
});
