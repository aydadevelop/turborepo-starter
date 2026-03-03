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

	const result = await page.evaluate(
		async ({ body, serverUrl }) => {
			const response = await fetch(`${serverUrl}/api/auth/sign-in/email`, {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			return { ok: response.ok, status: response.status };
		},
		{
			body: { email: credentials.email, password: credentials.password },
			serverUrl: SERVER_URL,
		}
	);

	if (!result.ok) {
		throw new Error(
			`Auth setup: sign-in as ${credentials.email} failed with ${result.status}`
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
