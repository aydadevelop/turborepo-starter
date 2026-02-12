#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const localD1Dir = path.resolve(scriptDir, "../../../.alchemy/miniflare/v3/d1");

if (!existsSync(localD1Dir)) {
	console.log(`Local D1 state not found: ${localD1Dir}`);
	process.exit(0);
}

rmSync(localD1Dir, { recursive: true, force: true });
console.log(`Removed local D1 state: ${localD1Dir}`);
