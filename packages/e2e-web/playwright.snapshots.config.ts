/**
 * Lightweight Playwright config for visual snapshot tests only.
 * Targets the local dev server on port 5173 — no auth setup required.
 * Used by the Copilot hooks post-agent snapshot script.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/ui-snapshots.spec.ts",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	workers: 1,
	reporter: "line",
	expect: {
		timeout: 10_000,
		toHaveScreenshot: {
			// Allow minor pixel diffs from sub-pixel antialiasing
			maxDiffPixelRatio: 0.02,
			animations: "disabled",
		},
	},
	use: {
		baseURL: process.env.SNAPSHOT_BASE_URL ?? "http://localhost:5173",
		actionTimeout: 10_000,
		navigationTimeout: 15_000,
		// Consistent viewport for reproducible snapshots
		viewport: { width: 1280, height: 720 },
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	// Do NOT define webServer — must already be running (checked by the hook)
});
