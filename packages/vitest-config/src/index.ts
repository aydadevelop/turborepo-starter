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
};
