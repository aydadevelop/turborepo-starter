import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
	clean: true,
	minify: true,
	platform: "node",
	// Bundle all deps into the output — the Dockerfile only ships root
	// node_modules, not app-level ones (turbo prune / bun workspace hoisting).
	noExternal: [/.+/],
	// better-auth must stay external (dynamic requires, plugin loaders)
	external: [/^better-auth/, /^@better-auth\//],
});
