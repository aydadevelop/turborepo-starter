/**
 * Stub for cloudflare:sockets — allows Bun scripts that transitively import
 * proxy-fetch.ts to run outside a Cloudflare Worker environment.
 *
 * Usage: bun --preload scripts/cf-sockets-stub.ts <your-script.ts>
 */
Bun.plugin({
	name: "cloudflare-sockets-stub",
	setup(build: { module: (specifier: string, factory: () => { exports: unknown; loader: string }) => void }) {
		build.module("cloudflare:sockets", () => ({
			exports: {
				connect: () => {
					throw new Error(
						"cloudflare:sockets is only available inside a CF Worker",
					);
				},
			},
			loader: "object",
		}));
	},
});
