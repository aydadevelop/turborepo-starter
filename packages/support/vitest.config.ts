import { sharedConfig } from "@my-app/vitest-config";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
	sharedConfig,
	defineConfig({
		test: {
			name: "support",
		},
	})
);
