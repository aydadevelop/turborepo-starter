import { test as setup } from "@playwright/test";
import { getPlaywrightRuntimeEnv } from "../playwright.env";
import { SEED_CREDENTIALS } from "./utils/seed";
import { url } from "./utils/url";

const { serverURL: SERVER_URL } = getPlaywrightRuntimeEnv();

const signInAndSaveState = async (
	page: import("@playwright/test").Page,
	credentials: { email: string; password: string },
	storagePath: string
) => {
	await page.goto(url("/"));

	const response = await page.context().request.post(
		`${SERVER_URL}/api/auth/sign-in/email`,
		{
			data: { email: credentials.email, password: credentials.password },
			headers: { "content-type": "application/json" },
		}
	);

	if (!response.ok()) {
		throw new Error(
			`Auth setup: sign-in as ${credentials.email} failed with ${response.status()}`
		);
	}

	await page.context().storageState({ path: storagePath });
};

setup("authenticate as admin", async ({ page }) => {
	await signInAndSaveState(
		page,
		SEED_CREDENTIALS.admin,
		"e2e/.auth/admin.json"
	);
});

setup("authenticate as operator", async ({ page }) => {
	await signInAndSaveState(
		page,
		SEED_CREDENTIALS.operator,
		"e2e/.auth/operator.json"
	);
});
