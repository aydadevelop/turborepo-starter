import { bootstrapLocalE2EDatabase } from "@my-app/db/e2e/bootstrap";

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
			"[playwright:global-setup] Skipping DB seed (PLAYWRIGHT_SKIP_SEED=1)",
		);
		return;
	}

	if (
		process.env.PLAYWRIGHT_MANAGED_SERVERS !== "0" &&
		process.env.PLAYWRIGHT_DATABASE_URL
	) {
		console.log(
			"[playwright:global-setup] Skipping DB seed because managed services already bootstrap the dedicated E2E database",
		);
		return;
	}

	const baseURL = process.env.PLAYWRIGHT_BASE_URL;
	if (baseURL && !isLocalBaseURL(baseURL)) {
		console.log(
			`[playwright:global-setup] Skipping DB seed for remote base URL (${baseURL})`,
		);
		return;
	}

	const anchorDate = process.env.PLAYWRIGHT_SEED_ANCHOR_DATE ?? "2026-03-15";

	await bootstrapLocalE2EDatabase({ anchorDate });
}
