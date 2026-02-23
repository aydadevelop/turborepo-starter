#!/usr/bin/env node
/**
 * e2e-repair-state.mjs
 *
 * Scans the Alchemy state directory for the e2e stage and removes any JSON
 * files that contain invalid JSON (e.g. truncated from a killed process).
 *
 * This is a surgical repair that does NOT wipe the entire state directory,
 * so Alchemy can skip unchanged resources on the next run. Compare to
 * scripts/e2e-clean.mjs which performs a full wipe.
 *
 * Called automatically before `test:e2e` in packages/e2e-web.
 */

import { readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const E2E_STATE_DIR = resolve(rootDir, "packages/infra/.alchemy/my-app/e2e");

let repaired = 0;

const repairDir = (dir) => {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return; // dir doesn't exist yet — nothing to repair
	}

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			repairDir(fullPath);
		} else if (entry.name.endsWith(".json")) {
			try {
				JSON.parse(readFileSync(fullPath, "utf8"));
			} catch {
				rmSync(fullPath);
				console.log(
					`[e2e:repair] Removed corrupted state file: ${fullPath.replace(`${rootDir}/`, "")}`
				);
				repaired++;
			}
		}
	}
};

repairDir(E2E_STATE_DIR);

if (repaired === 0) {
	console.log("[e2e:repair] All e2e state files are valid");
} else {
	console.log(
		`[e2e:repair] Removed ${repaired} corrupted file(s) — Alchemy will recreate them`
	);
}
