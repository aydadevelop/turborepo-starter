import { fileURLToPath } from "node:url";
import type { ViteUserConfig } from "vitest/config";

export const sharedConfig: ViteUserConfig = {
	test: {
		globals: true,
		include: ["**/*.{test,spec}.{js,ts}"],
		exclude: ["**/node_modules/**", "**/dist/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			reportsDirectory: "./coverage",
		},
		passWithNoTests: true,
	},
	resolve: {
		alias: {
			// Mock cloudflare:workers module for tests
			"cloudflare:workers": fileURLToPath(
				new URL("./cloudflare-workers-mock.ts", import.meta.url)
			),
		},
	},
};
