import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig(async () => {
	const shouldAnalyzeBundle = process.env.ANALYZE_BUNDLE === "1";
	const plugins: PluginOption[] = [tailwindcss(), sveltekit()];

	if (shouldAnalyzeBundle) {
		const { analyzer } = await import("vite-bundle-analyzer");
		plugins.push(
			analyzer({
				analyzerMode: "static",
				fileName: ".svelte-kit/bundle-stats",
				openAnalyzer: false,
				defaultSizes: "gzip",
			}) as unknown as PluginOption
		);
	}

	return {
		plugins,
		ssr: {
			noExternal: ["svelte-sonner"],
		},
	};
});
