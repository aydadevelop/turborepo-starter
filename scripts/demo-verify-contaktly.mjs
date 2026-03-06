#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const run = (command, args, options = {}) =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd ?? process.cwd(),
			env: {
				...process.env,
				CONTAKTLY_DEMO_MODE: "1",
			},
			stdio: "inherit",
		});

		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`${command} exited via signal ${signal}`));
				return;
			}

			if (code && code !== 0) {
				reject(new Error(`${command} exited with code ${code}`));
				return;
			}

			resolve();
		});

		child.on("error", reject);
	});

await run("bunx", [
	"turbo",
	"run",
	"lint",
	"--filter=@my-app/api",
	"--filter=@my-app/api-contract",
	"--filter=web",
	"--filter=widget",
	"--filter=site-astro",
]);
await run("bunx", [
	"turbo",
	"run",
	"check-types",
	"--filter=@my-app/api",
	"--filter=@my-app/api-contract",
	"--filter=web",
	"--filter=widget",
	"--filter=site-astro",
]);
await run("bun", ["run", "test"], { cwd: "packages/api" });
await run(
	"bun",
	[
		"run",
		"test:e2e",
		"--",
		"e2e/auth.spec.ts",
		"e2e/contaktly-plan.spec.ts",
		"e2e/contaktly-widget-config.spec.ts",
		"e2e/contaktly-google-calendar.spec.ts",
		"e2e/contaktly-conversations.spec.ts",
		"e2e/contaktly-prefill.spec.ts",
		"e2e/contaktly-admin-surfaces.spec.ts",
	],
	{ cwd: "packages/e2e-web" }
);
await run("node", ["scripts/e2e-kill-ports.mjs", "4174", "43110", "43275"]);
await run("bun", ["run", "test:e2e", "--", "widget-flow.spec.ts"], {
	cwd: "apps/widget",
});
