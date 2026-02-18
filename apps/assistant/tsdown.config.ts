import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
	clean: true,
	minify: true,
	noExternal: [/@full-stack-cf-app\/.*/],
	external: ["cloudflare:workers"],
});
