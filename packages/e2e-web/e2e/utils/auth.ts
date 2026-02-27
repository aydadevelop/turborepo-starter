import type { Page } from "@playwright/test";
import { getPlaywrightRuntimeEnv } from "../../playwright.env";
import { SEED_CREDENTIALS } from "./seed";
import { url } from "./url";

const { serverURL: SERVER_URL } = getPlaywrightRuntimeEnv();
const LEADING_SLASHES_RE = /^\/+/;

interface BrowserFetchResult {
	contentType: string | null;
	json: unknown;
	ok: boolean;
	status: number;
	text: string;
	url: string;
}

export const browserRequest = async (
	page: Page,
	options: {
		path: string;
		method?: "GET" | "POST";
		body?: Record<string, unknown>;
	}
): Promise<BrowserFetchResult> =>
	await page.evaluate(
		async ({ body, method, path, serverUrl }) => {
			const response = await fetch(`${serverUrl}${path}`, {
				method,
				credentials: "include",
				headers: body ? { "content-type": "application/json" } : undefined,
				body: body ? JSON.stringify(body) : undefined,
			});

			const text = await response.text();
			let json: unknown = null;
			if (text.length > 0) {
				try {
					json = JSON.parse(text);
				} catch {
					json = null;
				}
			}

			return {
				ok: response.ok,
				status: response.status,
				url: response.url,
				contentType: response.headers.get("content-type"),
				text,
				json,
			};
		},
		{
			path: options.path,
			method: options.method ?? "GET",
			body: options.body,
			serverUrl: SERVER_URL,
		}
	);

export const signInWithEmail = async (
	page: Page,
	params: { email: string; password: string }
) => {
	await page.goto(url("/"));

	const result = await browserRequest(page, {
		path: "/api/auth/sign-in/email",
		method: "POST",
		body: {
			email: params.email,
			password: params.password,
		},
	});

	if (!result.ok) {
		throw new Error(
			`sign-in failed with ${result.status}: ${result.text || "<empty>"}`
		);
	}
};

export const signInAsSeedOwner = async (page: Page) =>
	await signInWithEmail(page, SEED_CREDENTIALS.admin);

export const signInAsSeedAdmin = async (page: Page) =>
	await signInWithEmail(page, SEED_CREDENTIALS.admin);

export const signInAsSeedOperator = async (page: Page) =>
	await signInWithEmail(page, SEED_CREDENTIALS.operator);

export const rpcRequest = async (
	page: Page,
	options: {
		path: string;
		input?: unknown;
	}
) => {
	const normalizedPath = options.path.replace(LEADING_SLASHES_RE, "");
	return await browserRequest(page, {
		path: `/rpc/${normalizedPath}`,
		method: "POST",
		body: {
			json: options.input ?? null,
		},
	});
};
