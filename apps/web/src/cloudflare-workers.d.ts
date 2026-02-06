declare module "cloudflare:workers" {
	/**
	 * Fallback declaration for non-Workers toolchains (e.g. svelte-check in web).
	 * The real runtime binding shape is inferred in packages/env/env.d.ts.
	 */
	export const env: Record<string, string | undefined> & {
		DB?: unknown;
	};
}
