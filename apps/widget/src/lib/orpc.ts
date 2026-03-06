import type { AppContractClient } from "@my-app/api-contract/routers";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
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

const link = new RPCLink({
	url: resolveUrl(`${serverUrl}/rpc`),
	fetch(url, options) {
		return fetch(url, {
			...options,
			credentials: "omit",
		});
	},
});

export const client: AppContractClient = createORPCClient(link);
