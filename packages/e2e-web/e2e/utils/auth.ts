import type { Page } from "@playwright/test";
import { getPlaywrightRuntimeEnv } from "../../playwright.env";
import { SEED_CREDENTIALS } from "./seed";
import { url } from "./url";

const { serverURL: SERVER_URL } = getPlaywrightRuntimeEnv();

interface BrowserFetchResult {
	ok: boolean;
	status: number;
	url: string;
	contentType: string | null;
	text: string;
	json: unknown;
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
	await signInWithEmail(page, SEED_CREDENTIALS.owner);

export const signInAsSeedAdmin = async (page: Page) =>
	await signInWithEmail(page, SEED_CREDENTIALS.admin);
