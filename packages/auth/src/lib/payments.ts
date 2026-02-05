import { env } from "@full-stack-cf-app/env/server";
import { Polar } from "@polar-sh/sdk";

// Only create client if access token is provided
// This is checked in auth/index.ts before using the plugin
export const polarClient = new Polar({
	accessToken: env.POLAR_ACCESS_TOKEN || "placeholder",
	server: "sandbox",
});
