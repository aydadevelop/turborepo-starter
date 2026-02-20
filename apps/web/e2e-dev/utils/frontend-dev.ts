import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { url } from "./url";

interface StorageState {
	key: string;
	value: string;
}

export interface FrontendDevState {
	query?: Record<string, string | number | boolean>;
	localStorage?: Record<string, string>;
	sessionStorage?: Record<string, string>;
	viewport?: { width: number; height: number };
	waitAfterNavigationMs?: number;
}

export interface FrontendDevScreenshot {
	name: string;
	fullPage?: boolean;
}

const toStorageState = (
	input?: Record<string, string>
): StorageState[] | undefined =>
	input
		? Object.entries(input).map(([key, value]) => ({ key, value }))
		: undefined;

const sanitizeFilePart = (value: string): string =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9-_]+/g, "-")
		.replace(/^-+|-+$/g, "");

const withQuery = (
	route: string,
	query?: Record<string, string | number | boolean>
): string => {
	if (!query || Object.keys(query).length === 0) {
		return route;
	}
	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		searchParams.set(key, String(value));
	}
	const delimiter = route.includes("?") ? "&" : "?";
	return `${route}${delimiter}${searchParams.toString()}`;
};

export const applyFrontendDevState = async (
	page: Page,
	state?: FrontendDevState
): Promise<void> => {
	if (!state) {
		return;
	}

	if (state.viewport) {
		await page.setViewportSize(state.viewport);
	}

	const localStorageState = toStorageState(state.localStorage);
	const sessionStorageState = toStorageState(state.sessionStorage);
	if (!(localStorageState || sessionStorageState)) {
		return;
	}

	await page.addInitScript(
		({
			localStorageState: localEntries,
			sessionStorageState: sessionEntries,
		}) => {
			for (const { key, value } of localEntries ?? []) {
				window.localStorage.setItem(key, value);
			}
			for (const { key, value } of sessionEntries ?? []) {
				window.sessionStorage.setItem(key, value);
			}
		},
		{
			localStorageState,
			sessionStorageState,
		}
	);
};

export const gotoFrontendDevRoute = async (
	page: Page,
	route: string,
	state?: FrontendDevState
): Promise<void> => {
	await applyFrontendDevState(page, state);
	const routeWithQuery = url(withQuery(route, state?.query));
	const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
	const targetUrl = `${baseURL}${routeWithQuery}`;
	try {
		await page.goto(routeWithQuery);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("ERR_CONNECTION_REFUSED")
		) {
			throw new Error(
				`Cannot reach frontend at ${targetUrl}. Start your frontend (e.g. npm run dev:vite --workspace web) and rerun npm run test:frontend:dev --workspace web`
			);
		}
		throw error;
	}
	await page.waitForLoadState("domcontentloaded");
	if (state?.waitAfterNavigationMs && state.waitAfterNavigationMs > 0) {
		await page.waitForTimeout(state.waitAfterNavigationMs);
	}
};

export const captureFrontendDevScreenshot = async (
	page: Page,
	screenshot: FrontendDevScreenshot
): Promise<string> => {
	const outputDir = path.resolve("test-results/frontend-dev");
	mkdirSync(outputDir, { recursive: true });
	const fileName = `${sanitizeFilePart(screenshot.name)}.png`;
	const filePath = path.join(outputDir, fileName);
	await page.screenshot({
		path: filePath,
		fullPage: screenshot.fullPage ?? true,
	});
	return filePath;
};
