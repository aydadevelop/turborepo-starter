import { bootstrapLocalE2EDatabase } from "../../db/scripts/bootstrap-local-e2e.mjs";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const isLocalBaseURL = (value: string): boolean => {
	try {
		const parsed = new URL(value);
		return LOCAL_HOSTNAMES.has(parsed.hostname);
	} catch {
		return false;
	}
};

export default async function globalSetup(): Promise<void> {
	if (process.env.PLAYWRIGHT_SKIP_SEED === "1") {
		console.log(
			"[playwright:global-setup] Skipping DB seed (PLAYWRIGHT_SKIP_SEED=1)"
		);
		return;
	}

	const baseURL = process.env.PLAYWRIGHT_BASE_URL;
	if (baseURL && !isLocalBaseURL(baseURL)) {
		console.log(
			`[playwright:global-setup] Skipping DB seed for remote base URL (${baseURL})`
		);
		return;
	}

	const scenario = process.env.PLAYWRIGHT_SEED_SCENARIO ?? "baseline";
	const anchorDate = process.env.PLAYWRIGHT_SEED_ANCHOR_DATE ?? "2026-03-15";

	await bootstrapLocalE2EDatabase({ scenario, anchorDate });
}
