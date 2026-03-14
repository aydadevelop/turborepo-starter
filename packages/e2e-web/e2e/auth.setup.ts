import { E2E_BASELINE } from "@my-app/db/e2e/baseline";
import { test as setup } from "@playwright/test";
import { getPlaywrightRuntimeEnv } from "../playwright.env";
import { url } from "./utils/url";

const { serverURL: SERVER_URL } = getPlaywrightRuntimeEnv();

const signInAndSaveState = async (
	page: import("@playwright/test").Page,
	credentials: { email: string; password: string },
	storagePath: string,
) => {
	// Setup only needs a navigable document before API sign-in; waiting for full
	// `load` can flake under dev-server warmup.
	await page.goto(url("/"), { waitUntil: "domcontentloaded" });

	const response = await page
		.context()
		.request.post(`${SERVER_URL}/api/auth/sign-in/email`, {
			data: { email: credentials.email, password: credentials.password },
			headers: { "content-type": "application/json" },
		});

	if (!response.ok()) {
		throw new Error(
			`Auth setup: sign-in as ${credentials.email} failed with ${response.status()}`,
		);
	}

	await page.context().storageState({ path: storagePath });
};

setup("authenticate as admin", async ({ page }) => {
	await signInAndSaveState(page, E2E_BASELINE.admin, "e2e/.auth/admin.json");
});

setup("authenticate as operator", async ({ page }) => {
	await signInAndSaveState(
		page,
		E2E_BASELINE.operator,
		"e2e/.auth/operator.json",
	);
});
