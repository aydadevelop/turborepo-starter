#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const run = (command, args) =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: process.cwd(),
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

await run("node", [
	"scripts/e2e-kill-ports.mjs",
	"3000",
	"3001",
	"3002",
	"5173",
	"5174",
	"4321",
]);
await run("bun", ["run", "dev:contaktly:reset"]);
