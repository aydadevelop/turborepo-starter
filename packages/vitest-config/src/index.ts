import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ViteUserConfig } from "vitest/config";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.basename(currentDir) === "dist"
	? path.join(path.dirname(currentDir), "src")
	: currentDir;
const setupFile = path.join(sourceDir, "test-setup.ts");

export const sharedConfig: ViteUserConfig = {
	test: {
		globals: true,
		include: ["**/*.{test,spec}.{js,ts}"],
		exclude: ["**/node_modules/**", "**/dist/**"],
		setupFiles: [setupFile],
		hookTimeout: 120_000,
		testTimeout: 30_000,
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			reportsDirectory: "./coverage",
		},
		passWithNoTests: true,
	},
};
