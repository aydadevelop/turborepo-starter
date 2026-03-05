import { expect, test } from "@playwright/test";
import { browserRequest, rpcRequest } from "./utils/auth";
import { url } from "./utils/url";

interface SessionResponse {
	user?: {
		id?: string;
		isAnonymous?: boolean | null;
		is_anonymous?: boolean | null;
	};
}

interface RpcEnvelope<T> {
	json: T;
}

interface PrivateDataResult {
	message: string;
	user?: {
		id?: string;
		isAnonymous?: boolean | null;
		is_anonymous?: boolean | null;
	};
}

const orgCreateUrlPattern = /\/org\/create(\?|$)/;

test.describe("Anonymous Chat Session", () => {
	test("chat route auto-creates anonymous session for whoami dependencies", async ({
		page,
	}) => {
		await page.goto(url("/chat"));

		await expect
			.poll(
				async () => {
					const sessionResult = await browserRequest(page, {
						path: "/api/auth/get-session",
					});
					if (!(sessionResult.ok && sessionResult.json)) {
						return false;
					}

					const body = sessionResult.json as SessionResponse;
					const user = body.user;
					return Boolean(
						user?.id && (user.isAnonymous ?? user.is_anonymous ?? false)
					);
				},
				{ timeout: 15_000, intervals: [300, 600, 1000] }
			)
			.toBe(true);

		const privateDataResult = await rpcRequest(page, {
			path: "privateData",
		});
		expect(privateDataResult.status).toBe(200);

		const privateDataBody =
			privateDataResult.json as RpcEnvelope<PrivateDataResult>;
		const user = privateDataBody.json.user;
		expect(user?.id).toBeTruthy();
		expect(Boolean(user?.isAnonymous ?? user?.is_anonymous)).toBe(true);
	});
});

test.describe("Org Creation Cache Invalidation", () => {
	test("new account can create org and immediately see team data", async ({
		page,
	}) => {
		test.setTimeout(90_000);

		const nonce = Date.now();
		const email = `e2e-onboard-${nonce}@example.com`;
		const password = "password123";
		const orgName = `E2E Org ${nonce}`;

		await page.goto(url("/"));
		const signUpResult = await browserRequest(page, {
			path: "/api/auth/sign-up/email",
			method: "POST",
			body: {
				name: "E2E User",
				email,
				password,
			},
		});
		expect(signUpResult.status).toBe(200);

		await page.goto(url("/org/create?reason=new"));

		await expect(page).toHaveURL(orgCreateUrlPattern);

		await page.getByTestId("org-create-name-input").fill(orgName);

		const termsScrollBox = page.getByTestId("org-create-terms-scroll");
		await termsScrollBox.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
			element.dispatchEvent(new Event("scroll", { bubbles: true }));
		});

		await page.getByTestId("org-create-consent-checkbox").check();
		await page.getByTestId("org-create-submit-button").click();

		await expect(page).toHaveURL(url("/dashboard/settings"));

		await page.goto(url("/org/team"));
		await expect(page.getByTestId("org-heading")).toBeVisible();
		await expect(page.getByTestId("org-team-members-title")).toContainText(
			"Members (1)"
		);
		await expect(
			page.locator('[data-testid^="org-member-email-"]')
		).toBeVisible();
	});
});
