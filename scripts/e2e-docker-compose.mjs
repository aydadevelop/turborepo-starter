#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
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

const maskConnectionString = (value) =>
	value.replace(/\/\/.*@/, "//***@");

const parsePort = (value) => {
	const parsed = Number.parseInt(String(value ?? ""), 10);
	if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
		return null;
	}
	return parsed;
};

const extractPublishedPort = (portOutput) => {
	for (const line of portOutput.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const match = trimmed.match(/:(\d+)$/);
		const parsedPort = parsePort(match?.[1]);
		if (parsedPort) {
			return String(parsedPort);
		}
	}

	return null;
};

const normalizeExplicitDatabaseUrl = (value) => {
	if (!value) {
		return null;
	}

	try {
		const parsed = new URL(value);
		const isPostgresProtocol =
			parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
		if (isPostgresProtocol && parsed.port === "0") {
			return null;
		}
	} catch {
		// Keep non-URL values untouched; downstream code will surface invalid URLs.
	}

	return value;
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
	const dbHost = process.env.E2E_DB_HOST ?? "127.0.0.1";
	const testScript = process.env.E2E_DOCKER_TEST_SCRIPT ?? defaults.testScript;
	const rawExplicitDatabaseUrl =
		process.env.PLAYWRIGHT_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
	const explicitDatabaseUrl = normalizeExplicitDatabaseUrl(
		rawExplicitDatabaseUrl
	);
	if (rawExplicitDatabaseUrl && !explicitDatabaseUrl) {
		log(
			"Ignoring explicit database URL because it uses invalid port 0; resolving from Docker stack instead"
		);
	}
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

	const runComposeCapture = (args, allowFailure = false) => {
		try {
			return execFileSync("docker", [...composeBaseArgs, ...args], {
				cwd: repoRoot,
				env: composeEnv,
				encoding: "utf8",
			}).trim();
		} catch (error) {
			if (allowFailure) {
				return "";
			}
			throw error;
		}
	};

	const resolveDatabaseConnectionString = () => {
		if (explicitDatabaseUrl) {
			return explicitDatabaseUrl;
		}

		const fallbackHostPort = parsePort(dbPort) ?? parsePort(defaults.dbPort) ?? 5432;

		const publishedPort = extractPublishedPort(
			runComposeCapture(["port", "db", "5432"], true)
		);
		if (publishedPort) {
			return `postgresql://postgres:postgres@${dbHost}:${publishedPort}/myapp`;
		}

		const dbContainerId = runComposeCapture(["ps", "-q", "db"], true)
			.split(/\s+/)
			.find(Boolean);
		if (dbContainerId) {
			try {
				const dbContainerIp = execFileSync(
					"docker",
					[
						"inspect",
						"-f",
						"{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
						dbContainerId,
					],
					{
						cwd: repoRoot,
						env: composeEnv,
						encoding: "utf8",
					}
				).trim();
				if (dbContainerIp) {
					return `postgresql://postgres:postgres@${dbContainerIp}:5432/myapp`;
				}
			} catch {
				// Fallback to the configured host/port below.
			}
		}

		return `postgresql://postgres:postgres@${dbHost}:${fallbackHostPort}/myapp`;
	};

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

		const resolvedDatabaseUrl = resolveDatabaseConnectionString();
		testEnv.PLAYWRIGHT_DATABASE_URL =
			process.env.PLAYWRIGHT_DATABASE_URL ?? resolvedDatabaseUrl;
		testEnv.DATABASE_URL = process.env.DATABASE_URL ?? resolvedDatabaseUrl;
		log(
			`Using PostgreSQL endpoint ${maskConnectionString(
				testEnv.PLAYWRIGHT_DATABASE_URL
			)}`
		);

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
