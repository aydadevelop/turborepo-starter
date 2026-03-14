import { env } from "$env/dynamic/public";

const ABSOLUTE_URL_RE = /^https?:\/\//;
const DEFAULT_SERVER_URL = "http://localhost:3000";
const TRAILING_SLASHES_RE = /\/+$/;

function joinUrl(base: string, path: string): string {
	const normalizedBase = base.replace(TRAILING_SLASHES_RE, "");
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	return normalizedBase.length === 0
		? normalizedPath
		: `${normalizedBase}${normalizedPath}`;
}

export function resolveServerBaseUrl(): string {
	const raw = (env.PUBLIC_SERVER_URL ?? DEFAULT_SERVER_URL).trim();
	if (raw === "/") {
		return typeof window === "undefined"
			? "http://localhost"
			: window.location.origin;
	}

	const normalizedRaw = raw.replace(TRAILING_SLASHES_RE, "");
	if (ABSOLUTE_URL_RE.test(normalizedRaw)) {
		return normalizedRaw;
	}

	const origin =
		typeof window === "undefined" ? "http://localhost" : window.location.origin;
	return joinUrl(origin, normalizedRaw);
}

export function resolveServerPath(path: string): string {
	return joinUrl(resolveServerBaseUrl(), path);
}
