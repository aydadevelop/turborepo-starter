import type { AppRouterClient } from "@my-app/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/svelte-query";
import { env } from "$env/dynamic/public";

const TRAILING_SLASHES = /\/+$/;
const ABSOLUTE_URL = /^https?:\/\//;

const serverUrl = (env.PUBLIC_SERVER_URL ?? "").replace(TRAILING_SLASHES, "");

function resolveUrl(path: string): string {
	if (ABSOLUTE_URL.test(path)) {
		return path;
	}
	const origin =
		typeof window !== "undefined" ? window.location.origin : "http://localhost";
	return `${origin}${path}`;
}

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error) => {
			console.error(`Error: ${error.message}`);
		},
	}),
});

export const link = new RPCLink({
	url: resolveUrl(`${serverUrl}/rpc`),
	fetch(url, options) {
		return fetch(url, {
			...options,
			credentials: "include",
		});
	},
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
