import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
	outExtensions: () => ({ js: ".js" }),
	dts: true,
	clean: true,
	external: ["vitest"],
});
