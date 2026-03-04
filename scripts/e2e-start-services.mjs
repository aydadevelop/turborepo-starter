#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const envFilePath = path.resolve(repoRoot, ".env");

const VALID_SERVICES = new Set(["server", "assistant", "notifications"]);
const DEFAULT_SERVICES = ["server", "assistant", "notifications"];
const ENV_LINE_RE = /\r?\n/;

const loadDotEnvFile = (file) => {
	for (const line of readFileSync(file, "utf-8").split(ENV_LINE_RE)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) {
			continue;
		}

		const key = trimmed.slice(0, eqIndex).trim();
		let value = trimmed.slice(eqIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		if (key && process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
};

const parseArgs = (argv) => {
	const services = [];
	let ensureDb = false;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--ensure-db") {
			ensureDb = true;
			continue;
		}

		if (arg === "--service") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("Missing value for --service");
			}
			if (!VALID_SERVICES.has(value)) {
				throw new Error(
					`Unknown service "${value}". Expected one of: ${[...VALID_SERVICES].join(", ")}`
				);
			}
			services.push(value);
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return {
		ensureDb,
		services: services.length > 0 ? services : DEFAULT_SERVICES,
	};
};

const normalizeRuntimeEnv = () => {
	const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "43173";
	const serverPort = process.env.PLAYWRIGHT_SERVER_PORT ?? "43100";
	const notificationsPort = process.env.PLAYWRIGHT_NOTIFICATIONS_PORT ?? "43101";
	const assistantPort = process.env.PLAYWRIGHT_ASSISTANT_PORT ?? "43102";
	const webOrigin = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${webPort}`;
	const serverUrl =
		process.env.PLAYWRIGHT_SERVER_URL ?? `http://localhost:${serverPort}`;
	const assistantUrl =
		process.env.PLAYWRIGHT_ASSISTANT_URL ??
		`http://localhost:${assistantPort}`;

	const currentSecret = process.env.BETTER_AUTH_SECRET ?? "";
	if (currentSecret.length < 32) {
		process.env.BETTER_AUTH_SECRET = "e2e-local-secret-0123456789-abcdef";
	}

	process.env.OPEN_ROUTER_API_KEY =
		process.env.OPEN_ROUTER_API_KEY ?? "e2e-openrouter-placeholder";
	process.env.AI_MODEL = process.env.AI_MODEL ?? "openai/gpt-5-nano:nitro";

	process.env.SERVER_PORT = serverPort;
	process.env.NOTIFICATIONS_PORT = notificationsPort;
	process.env.ASSISTANT_PORT = assistantPort;

	process.env.SERVER_URL = serverUrl;
	process.env.BETTER_AUTH_URL = serverUrl;
	process.env.PUBLIC_SERVER_URL = serverUrl;
	process.env.ASSISTANT_URL = assistantUrl;
	process.env.PUBLIC_ASSISTANT_URL = assistantUrl;

	const corsOrigins = new Set(
		(process.env.CORS_ORIGIN ?? "")
			.split(",")
			.map((origin) => origin.trim())
			.filter(Boolean)
	);
	corsOrigins.add(webOrigin);
	process.env.CORS_ORIGIN = [...corsOrigins].join(",");
};

const runCommand = (command, args) =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: repoRoot,
			stdio: "inherit",
			env: process.env,
		});

		const forwardSignal = (signal) => {
			if (!child.killed) {
				child.kill(signal);
			}
		};

		process.on("SIGINT", forwardSignal);
		process.on("SIGTERM", forwardSignal);

		child.on("error", (error) => {
			process.off("SIGINT", forwardSignal);
			process.off("SIGTERM", forwardSignal);
			reject(error);
		});

		child.on("exit", (code, signal) => {
			process.off("SIGINT", forwardSignal);
			process.off("SIGTERM", forwardSignal);

			if (signal) {
				resolve(1);
				return;
			}
			resolve(code ?? 1);
		});
	});

const main = async () => {
	const { ensureDb, services } = parseArgs(process.argv.slice(2));

	if (existsSync(envFilePath)) {
		if (
			typeof (process).loadEnvFile === "function"
		) {
			(process).loadEnvFile(envFilePath);
		} else {
			loadDotEnvFile(envFilePath);
		}
	}

	normalizeRuntimeEnv();

	if (ensureDb) {
		const ensureDbExitCode = await runCommand("node", [
			path.resolve(repoRoot, "scripts/ensure-db.mjs"),
		]);
		if (ensureDbExitCode !== 0) {
			process.exit(ensureDbExitCode);
		}
	}

	const turboArgs = ["turbo", "run", "start:test"];
	for (const service of services) {
		turboArgs.push(`--filter=${service}`);
	}

	const turboExitCode = await runCommand("bunx", turboArgs);
	process.exit(turboExitCode);
};

main().catch((error) => {
	console.error("[e2e:start-services] Failed:", error);
	process.exit(1);
});
