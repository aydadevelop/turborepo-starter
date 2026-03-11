import { sharedConfig } from "@my-app/vitest-config";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
	sharedConfig,
	defineConfig({
		test: {
			exclude: [
				"**/node_modules/**",
				"**/dist/**",
				"**/*.browser.{test,spec}.{js,ts}",
				"**/e2e/**",
				"**/playwright-report/**",
				"**/test-results/**",
			],
		},
	})
);
