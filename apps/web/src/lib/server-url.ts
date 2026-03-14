import { env } from "$env/dynamic/public";

const ABSOLUTE_URL_RE = /^https?:\/\//;
const DEFAULT_SERVER_URL = "http://localhost:3000";
const TRAILING_SLASHES_RE = /\/+$/;

export function resolveServerBaseUrl(): string {
	const raw = (env.PUBLIC_SERVER_URL ?? DEFAULT_SERVER_URL).replace(
		TRAILING_SLASHES_RE,
		"",
	);
	if (ABSOLUTE_URL_RE.test(raw)) {
		return raw;
	}

	const origin =
		typeof window === "undefined" ? "http://localhost" : window.location.origin;
	return `${origin}${raw}`;
}

export function resolveServerPath(path: string): string {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	return `${resolveServerBaseUrl()}${normalizedPath}`;
}
