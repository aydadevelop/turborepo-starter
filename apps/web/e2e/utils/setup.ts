import type { Page } from "@playwright/test";
import { url } from "./url";

export interface E2EState {
	query?: Record<string, string | number | boolean>;
	localStorage?: Record<string, string>;
	sessionStorage?: Record<string, string>;
	viewport?: { width: number; height: number };
	waitMs?: number;
}

const withQuery = (
	route: string,
	query?: Record<string, string | number | boolean>
): string => {
	if (!query || Object.keys(query).length === 0) {
		return route;
	}
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		params.set(key, String(value));
	}
	const delimiter = route.includes("?") ? "&" : "?";
	return `${route}${delimiter}${params.toString()}`;
};

export const goto = async (
	page: Page,
	route: string,
	state?: E2EState
): Promise<void> => {
	if (state?.viewport) {
		await page.setViewportSize(state.viewport);
	}

	const hasStorage = state?.localStorage || state?.sessionStorage;
	if (hasStorage) {
		await page.addInitScript(
			({
				local,
				session,
			}: {
				local?: Record<string, string>;
				session?: Record<string, string>;
			}) => {
				for (const [key, value] of Object.entries(local ?? {})) {
					window.localStorage.setItem(key, value);
				}
				for (const [key, value] of Object.entries(session ?? {})) {
					window.sessionStorage.setItem(key, value);
				}
			},
			{ local: state.localStorage, session: state.sessionStorage }
		);
	}

	const target = url(withQuery(route, state?.query));
	const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

	try {
		await page.goto(target);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("ERR_CONNECTION_REFUSED")
		) {
			throw new Error(
				`Cannot reach frontend at ${baseURL}${target}. Start the frontend (npm run dev:vite --workspace web) then rerun tests.`
			);
		}
		throw error;
	}

	await page.waitForLoadState("domcontentloaded");

	if (state?.waitMs && state.waitMs > 0) {
		await page.waitForTimeout(state.waitMs);
	}
};
