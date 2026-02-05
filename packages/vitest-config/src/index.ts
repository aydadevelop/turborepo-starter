import type { UserConfig } from "vitest/config";

export const sharedConfig: UserConfig = {
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
