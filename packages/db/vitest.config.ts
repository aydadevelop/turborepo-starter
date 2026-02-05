import { sharedConfig } from "@full-stack-cf-app/vitest-config";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
	sharedConfig,
	defineConfig({
		test: {
			// Pool threads don't work well with better-sqlite3
			pool: "forks",
		},
	})
);
