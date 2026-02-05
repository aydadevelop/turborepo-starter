import { sharedConfig } from "@full-stack-cf-app/vitest-config";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
	sharedConfig,
	defineConfig({
		test: {
			pool: "forks",
		},
	})
);
