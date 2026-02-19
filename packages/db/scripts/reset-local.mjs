#!/usr/bin/env node

import {
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

// Remove local Miniflare D1 sqlite files
const localD1Dir = path.resolve(repoRoot, ".alchemy/miniflare/v3/d1");

if (existsSync(localD1Dir)) {
	rmSync(localD1Dir, { recursive: true, force: true });
	console.log(`Removed local D1 state: ${localD1Dir}`);
} else {
	console.log(`Local D1 state not found: ${localD1Dir}`);
}

// Clear recorded migration history for every local stage (dev/e2e/etc) so the
// next `alchemy dev` re-applies migrations to the fresh Miniflare database.
const alchemyAppStateRoot = path.resolve(
	repoRoot,
	"packages/infra/.alchemy/full-stack-cf-app"
);

if (existsSync(alchemyAppStateRoot)) {
	const stageDirs = readdirSync(alchemyAppStateRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

	for (const stageDir of stageDirs) {
		const alchemyDbStatePath = path.resolve(
			alchemyAppStateRoot,
			stageDir,
			"database.json"
		);
		if (!existsSync(alchemyDbStatePath)) {
			continue;
		}

		const state = JSON.parse(readFileSync(alchemyDbStatePath, "utf8"));
		if (
			Array.isArray(state.props?.migrationsFiles) &&
			state.props.migrationsFiles.length > 0
		) {
			state.props.migrationsFiles = [];
			writeFileSync(alchemyDbStatePath, `${JSON.stringify(state, null, 2)}\n`);
			console.log(`Cleared migration state: ${alchemyDbStatePath}`);
		}
	}
}
