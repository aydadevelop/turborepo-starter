#!/usr/bin/env node

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

// Remove local Miniflare D1 sqlite files
const localD1Dir = path.resolve(repoRoot, ".alchemy/miniflare/v3/d1");

if (!existsSync(localD1Dir)) {
	console.log(`Local D1 state not found: ${localD1Dir}`);
} else {
	rmSync(localD1Dir, { recursive: true, force: true });
	console.log(`Removed local D1 state: ${localD1Dir}`);
}

// Clear the recorded migration history in Alchemy state so that the next
// `npm run dev` re-applies all migrations to the fresh Miniflare database.
// Without this, Alchemy sees "no changes" and skips migrations, leaving an
// empty database while reporting everything is fine.
const alchemyDbStatePath = path.resolve(
	repoRoot,
	"packages/infra/.alchemy/full-stack-cf-app/dev/database.json"
);

if (existsSync(alchemyDbStatePath)) {
	const state = JSON.parse(readFileSync(alchemyDbStatePath, "utf8"));
	if (Array.isArray(state.props?.migrationsFiles) && state.props.migrationsFiles.length > 0) {
		state.props.migrationsFiles = [];
		writeFileSync(alchemyDbStatePath, `${JSON.stringify(state, null, 2)}\n`);
		console.log(`Cleared migration state: ${alchemyDbStatePath}`);
	}
}
