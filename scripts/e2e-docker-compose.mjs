#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const defaults = {
	projectName: "myapp-e2e",
	dbPort: "55432",
	serverPort: "43100",
	assistantPort: "43102",
	notificationsPort: "43101",
	webPort: "43173",
	testScript: "test:e2e:external",
	upAttempts: "2",
};

const log = (message) => {
	console.log(`[e2e:docker] ${message}`);
};

const runCommand = ({ command, args, env, allowFailure = false }) =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: repoRoot,
			stdio: "inherit",
			env,
		});

		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`${command} ${args.join(" ")} exited via ${signal}`));
				return;
			}

			const exitCode = code ?? 1;
			if (!allowFailure && exitCode !== 0) {
				reject(
					new Error(
						`${command} ${args.join(" ")} exited with code ${exitCode}`
					)
				);
				return;
			}
			resolve(exitCode);
		});
	});

const main = async () => {
	const projectName = process.env.E2E_DOCKER_PROJECT ?? defaults.projectName;
	const dbPort = process.env.E2E_DB_PORT ?? defaults.dbPort;
	const serverPort =
		process.env.PLAYWRIGHT_SERVER_PORT ?? defaults.serverPort;
	const assistantPort =
		process.env.PLAYWRIGHT_ASSISTANT_PORT ?? defaults.assistantPort;
	const notificationsPort =
		process.env.PLAYWRIGHT_NOTIFICATIONS_PORT ?? defaults.notificationsPort;
	const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? defaults.webPort;
	const testScript = process.env.E2E_DOCKER_TEST_SCRIPT ?? defaults.testScript;
	const upAttempts = Math.max(
		1,
		Number.parseInt(
			process.env.E2E_DOCKER_UP_ATTEMPTS ?? defaults.upAttempts,
			10
		) || 1
	);

	const composeEnv = {
		...process.env,
		E2E_DB_PORT: dbPort,
		PLAYWRIGHT_SERVER_PORT: serverPort,
		PLAYWRIGHT_ASSISTANT_PORT: assistantPort,
		PLAYWRIGHT_NOTIFICATIONS_PORT: notificationsPort,
		PLAYWRIGHT_WEB_PORT: webPort,
	};

	const testEnv = {
		...composeEnv,
		PLAYWRIGHT_MANAGED_SERVERS: "0",
		PLAYWRIGHT_REUSE_SERVERS: process.env.PLAYWRIGHT_REUSE_SERVERS ?? "1",
		PLAYWRIGHT_BASE_URL:
			process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${webPort}`,
		PLAYWRIGHT_SERVER_URL:
			process.env.PLAYWRIGHT_SERVER_URL ?? `http://localhost:${serverPort}`,
		PLAYWRIGHT_ASSISTANT_URL:
			process.env.PLAYWRIGHT_ASSISTANT_URL ??
			`http://localhost:${assistantPort}`,
		PLAYWRIGHT_NOTIFICATIONS_URL:
			process.env.PLAYWRIGHT_NOTIFICATIONS_URL ??
			`http://localhost:${notificationsPort}`,
		DATABASE_URL:
			process.env.DATABASE_URL ??
			`postgresql://postgres:postgres@localhost:${dbPort}/myapp`,
	};

	const composeBaseArgs = [
		"compose",
		"-p",
		projectName,
		"-f",
		"docker-compose.yml",
		"-f",
		"docker-compose.e2e.yml",
	];

	const runCompose = (args, allowFailure = false) =>
		runCommand({
			command: "docker",
			args: [...composeBaseArgs, ...args],
			env: composeEnv,
			allowFailure,
		});

	const down = async () => {
		await runCompose(["down", "--volumes", "--remove-orphans"], true);
	};

	log("Cleaning up any previous e2e Docker stack");
	await down();

	try {
		for (let attempt = 1; attempt <= upAttempts; attempt += 1) {
			try {
				log(
					`Starting Docker e2e stack (build + wait), attempt ${attempt}/${upAttempts}`
				);
				await runCompose([
					"up",
					"-d",
					"--build",
					"--wait",
					"db",
					"smtp-server",
					"server",
					"assistant",
					"notifications",
					"web",
				]);
				break;
			} catch (error) {
				if (attempt >= upAttempts) {
					throw error;
				}
				log(`Docker stack startup failed: ${error}`);
				log("Retrying from a clean stack");
				await down();
			}
		}

		log(`Running Playwright against Docker stack via script "${testScript}"`);
		await runCommand({
			command: "bun",
			args: ["run", testScript],
			env: testEnv,
		});
	} catch (error) {
		log("Failure detected, dumping container status and recent logs");
		await runCompose(["ps"], true);
		await runCompose(
			[
				"logs",
				"--no-color",
				"--tail",
				"120",
				"db",
				"server",
				"assistant",
				"notifications",
				"web",
			],
			true
		);
		throw error;
	} finally {
		if (process.env.E2E_DOCKER_KEEP_UP === "1") {
			log("E2E_DOCKER_KEEP_UP=1, leaving Docker stack running");
		} else {
			log("Stopping Docker e2e stack");
			await down();
		}
	}
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
