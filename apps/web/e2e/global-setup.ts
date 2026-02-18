import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const seedScriptPath = path.resolve(
	repoRoot,
	"packages/db/scripts/seed-local.mjs"
);
const d1Dir = path.resolve(
	repoRoot,
	".alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject"
);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hasSqliteDatabase = (): boolean => {
	if (!existsSync(d1Dir)) {
		return false;
	}
	return readdirSync(d1Dir).some(
		(name) =>
			name.endsWith(".sqlite") &&
			!name.includes("-wal") &&
			!name.includes("-shm")
	);
};

const waitForLocalD1 = async () => {
	const timeoutMs = 60_000;
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		if (hasSqliteDatabase()) {
			return;
		}
		await delay(500);
	}

	throw new Error(
		`Timed out waiting for local D1 sqlite files under ${d1Dir}.`
	);
};

export default async function globalSetup(): Promise<void> {
	if (process.env.PLAYWRIGHT_SKIP_SEED === "1") {
		console.log(
			"[playwright:global-setup] Skipping DB seed (PLAYWRIGHT_SKIP_SEED=1)"
		);
		return;
	}

	const scenario = process.env.PLAYWRIGHT_SEED_SCENARIO ?? "baseline";
	const anchorDate = process.env.PLAYWRIGHT_SEED_ANCHOR_DATE ?? "2026-03-15";

	await waitForLocalD1();

	execFileSync(
		"node",
		[seedScriptPath, "--scenario", scenario, "--anchor-date", anchorDate],
		{
			cwd: repoRoot,
			stdio: "inherit",
		}
	);
}
