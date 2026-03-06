const DEFAULT_PRIVATE_APP_ORIGINS = [
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"http://localhost:5174",
	"http://127.0.0.1:5174",
	"http://localhost:4321",
	"http://127.0.0.1:4321",
] as const;
const TRAILING_SLASH_RE = /\/+$/;

const normalizeOrigin = (value: string) =>
	value.trim().replace(TRAILING_SLASH_RE, "");

export const parseCorsOrigins = (
	value: string | undefined,
	extraOrigins: readonly string[] = []
) => {
	const configured = (value ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

	const merged = new Set<string>();
	for (const origin of [
		...DEFAULT_PRIVATE_APP_ORIGINS,
		...extraOrigins,
		...configured,
	]) {
		const normalized = normalizeOrigin(origin);
		if (normalized) {
			merged.add(normalized);
		}
	}

	return [...merged];
};

export const createPrivateAppCorsOptions = (
	value: string | undefined,
	extraOrigins: readonly string[] = []
) => {
	const origins = parseCorsOrigins(value, extraOrigins);
	if (origins.length === 0) {
		throw new Error(
			"CORS_ORIGIN is required. Provide a comma-separated list of allowed origins."
		);
	}

	return {
		origin: origins,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"Accept",
			"X-Requested-With",
			"X-ORPC-Source",
			"X-ORPC-Method",
			"X-ORPC-Last-Event-Id",
		],
		credentials: true,
	};
};
