import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:43173";
const serverURL = process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:43100";
const assistantURL =
	process.env.PLAYWRIGHT_ASSISTANT_URL ?? "http://localhost:43102";

process.env.PLAYWRIGHT_BASE_URL ??= baseURL;
process.env.PLAYWRIGHT_SERVER_URL ??= serverURL;
process.env.PLAYWRIGHT_ASSISTANT_URL ??= assistantURL;

export default defineConfig({
	testDir: "./e2e",
	globalSetup: "./e2e/global-setup.ts",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	use: {
		baseURL,
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: [
		{
			command: `for p in 43173; do lsof -ti tcp:$p | xargs kill 2>/dev/null || true; done && PUBLIC_SERVER_URL=${serverURL} PUBLIC_ASSISTANT_URL=${assistantURL} npm run dev -- --port 43173 --strictPort`,
			url: baseURL,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
		{
			// Starts server, notifications, and assistant workers on dedicated e2e ports.
			// ALCHEMY_SKIP_WEB=1 prevents the SvelteKit worker from conflicting with Vite above.
			command:
				"cd ../.. && for p in 43100 43101 43102; do lsof -ti tcp:$p | xargs kill 2>/dev/null || true; done && ALCHEMY_SKIP_WEB=1 ALCHEMY_E2E=1 STAGE=e2e npm run dev:server",
			url: `${assistantURL}/health`,
			reuseExistingServer: true,
			timeout: 120_000,
		},
	],
});
