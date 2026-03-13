import type { AppContractClient } from "@my-app/api-contract/routers";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/svelte-query";
import { resolveServerPath } from "./server-url";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000, // 30 s — avoid redundant refetches on mount/focus
			refetchOnWindowFocus: false, // explicit invalidation after mutations instead
			retry: 1,
		},
	},
	queryCache: new QueryCache({
		onError: (error) => {
			console.error(`Error: ${error.message}`);
		},
	}),
});

export const link = new RPCLink({
	url: resolveServerPath("/rpc"),
	fetch(url, options) {
		return fetch(url, {
			...options,
			credentials: "include",
		});
	},
});

export const client: AppContractClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
