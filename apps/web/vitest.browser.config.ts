import { sharedConfig } from "@my-app/vitest-config";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		...sharedConfig.test,
		include: ["src/**/*.browser.{test,spec}.{js,ts}"],
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/e2e/**",
			"**/playwright-report/**",
			"**/test-results/**",
		],
		setupFiles: ["./src/test/browser/setup.ts"],
		browser: {
			enabled: true,
			provider: playwright(),
			headless: true,
			instances: [
				{
					browser: "chromium",
					viewport: {
						width: 1366,
						height: 900,
					},
				},
			],
		},
	},
});
