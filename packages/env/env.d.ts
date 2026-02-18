import type { assistant, server } from "@full-stack-cf-app/infra/alchemy.run";

// This file infers types for the cloudflare:workers environment from your Alchemy Worker.
// @see https://alchemy.run/concepts/bindings/#type-safe-bindings

export type CloudflareEnv = typeof server.Env & typeof assistant.Env;

declare global {
	type Env = CloudflareEnv;
}

declare module "cloudflare:workers" {
	export const env: CloudflareEnv;

	namespace Cloudflare {
		export interface Env extends CloudflareEnv {}
	}
}
