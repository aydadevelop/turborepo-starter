import {
	test as base,
	type Page,
	expect as playwrightExpect,
} from "@playwright/test";
import { getPlaywrightRuntimeEnv } from "../playwright.env";
import { TestDataFactory } from "./utils/test-data-factory";

const { baseURL, serverURL } = getPlaywrightRuntimeEnv();

export const expect = playwrightExpect;

export const ADMIN_STORAGE_STATE = "e2e/.auth/admin.json";
export const OPERATOR_STORAGE_STATE = "e2e/.auth/operator.json";

export interface TestFixtures {
	/** A Page pre-authenticated as the E2E baseline admin user. */
	adminPage: Page;
	/** A Page pre-authenticated as the E2E baseline operator user. */
	operatorPage: Page;
	/** Factory for creating test-scoped entities — auto-cleans on teardown. */
	testData: TestDataFactory;
	/** Unique namespace prefix for this test (e.g. "t_1a2b_1709467200"). */
	testNamespace: string;
}

let namespaceCounter = 0;

export const test = base.extend<TestFixtures>({
	adminPage: async ({ browser }, use) => {
		const context = await browser.newContext({
			storageState: ADMIN_STORAGE_STATE,
		});
		const page = await context.newPage();
		await use(page);
		await context.close();
	},

	operatorPage: async ({ browser }, use) => {
		const context = await browser.newContext({
			storageState: OPERATOR_STORAGE_STATE,
		});
		const page = await context.newPage();
		await use(page);
		await context.close();
	},

	testNamespace: [
		// oxlint-disable-next-line no-empty-pattern -- Playwright fixture API requires destructuring
		async ({}, use) => {
			const id = (++namespaceCounter).toString(36);
			const ts = Math.floor(Date.now() / 1000).toString(36);
			await use(`t_${id}_${ts}`);
		},
		{ scope: "test" },
	],

	testData: async (
		{ testNamespace }: TestFixtures,
		use: (f: TestDataFactory) => Promise<void>,
	) => {
		const factory = new TestDataFactory(testNamespace, serverURL, baseURL);
		await use(factory);
		await factory.cleanup();
	},
});
