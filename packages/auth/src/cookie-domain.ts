const WORKERS_DEV_RE = /\.([^.]+\.workers\.dev)$/;
const SHARED_COOKIE_SUBDOMAIN_PREFIXES = new Set(["api", "server"]);

export const deriveSharedCookieDomain = (hostname: string): string | null => {
	const workersDevMatch = hostname.match(WORKERS_DEV_RE);
	if (workersDevMatch?.[1]) {
		return workersDevMatch[1];
	}

	const hostParts = hostname.split(".");
	if (hostParts.length < 3) {
		return null;
	}

	const firstLabel = hostParts[0]?.toLowerCase() ?? "";
	if (!SHARED_COOKIE_SUBDOMAIN_PREFIXES.has(firstLabel)) {
		return null;
	}

	return hostParts.slice(1).join(".");
};

export const derivePasskeyRpId = (hostname: string): string => {
	if (hostname === "localhost") {
		return "localhost";
	}

	return hostname.match(WORKERS_DEV_RE)?.[1] ?? hostname;
};