import type { RouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { AssistantRouter } from "@full-stack-cf-app/assistant/router";

import { PUBLIC_ASSISTANT_URL } from "$env/static/public";

const TRAILING_SLASHES = /\/+$/;
const ABSOLUTE_URL = /^https?:\/\//;

const assistantUrl = PUBLIC_ASSISTANT_URL.replace(TRAILING_SLASHES, "");

function resolveUrl(path: string): string {
	if (ABSOLUTE_URL.test(path)) {
		return path;
	}
	const origin =
		typeof window !== "undefined" ? window.location.origin : "http://localhost";
	return `${origin}${path}`;
}

const link = new RPCLink({
	url: resolveUrl(`${assistantUrl}/rpc`),
	fetch(url, options) {
		return fetch(url, {
			...options,
			credentials: "include",
		});
	},
});

export const assistantClient: RouterClient<AssistantRouter> =
	createORPCClient(link);
