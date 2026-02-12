#!/usr/bin/env node
import { spawn } from "node:child_process";

const configuredServerUrl = process.env.CALENDAR_WEBHOOK_SERVER_URL;
const defaultServerUrl = "http://localhost:3000";
const WEBHOOK_PATH =
	process.env.CALENDAR_WEBHOOK_PATH ?? "/webhooks/calendar/google";
const SHOULD_AUTO_START_SERVER =
	process.env.CALENDAR_WEBHOOK_START_SERVER !== "0";
const SERVER_READY_TIMEOUT_MS = 120_000;
const TUNNEL_READY_TIMEOUT_MS = 60_000;
const CLEANUP_TIMEOUT_MS = 10_000;
const TRAILING_SLASH_REGEX = /\/+$/;
const SERVER_URL_LOG_REGEX =
	/(?:Server\s*->|Ready at)\s+(https?:\/\/[^\s]+)\s*/i;
const TRYCLOUDFLARE_URL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
let serverUrl = (configuredServerUrl ?? defaultServerUrl).replace(
	TRAILING_SLASH_REGEX,
	""
);

const wait = (ms) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const waitForChildExit = (childProcess) =>
	new Promise((resolve) => {
		childProcess.once("exit", () => {
			resolve(true);
		});
	});

const terminateProcess = async (childProcess, label) => {
	if (!childProcess || childProcess.exitCode !== null) {
		return;
	}

	const { pid } = childProcess;
	const hasValidPid = typeof pid === "number";

	try {
		if (hasValidPid) {
			process.kill(-pid, "SIGTERM");
		} else {
			childProcess.kill("SIGTERM");
		}
	} catch {
		childProcess.kill("SIGTERM");
	}

	const exited = await Promise.race([
		waitForChildExit(childProcess),
		wait(CLEANUP_TIMEOUT_MS).then(() => false),
	]);

	if (exited) {
		return;
	}

	console.warn(
		`Timeout waiting for ${label} to stop after SIGTERM, forcing SIGKILL.`
	);

	try {
		if (hasValidPid) {
			process.kill(-pid, "SIGKILL");
		} else {
			childProcess.kill("SIGKILL");
		}
	} catch {
		childProcess.kill("SIGKILL");
	}
};

const extractServerUrl = (text) => {
	const readyMatch = text.match(SERVER_URL_LOG_REGEX);
	if (!readyMatch) {
		return null;
	}
	return readyMatch[1].replace(TRAILING_SLASH_REGEX, "");
};

const isServerReachable = async () => {
	try {
		const response = await fetch(`${serverUrl}${WEBHOOK_PATH}`, {
			method: "POST",
		});
		return response.status === 202;
	} catch {
		return false;
	}
};

const waitForServer = async () => {
	const startAt = Date.now();
	while (Date.now() - startAt < SERVER_READY_TIMEOUT_MS) {
		if (await isServerReachable()) {
			return true;
		}
		await wait(1500);
	}
	return false;
};

const ensureCloudflaredInstalled = async () => {
	const probe = spawn("cloudflared", ["--version"], {
		stdio: "ignore",
	});
	const exitCode = await new Promise((resolve) => {
		probe.on("error", () => resolve(-1));
		probe.on("close", (code) => resolve(code ?? 1));
	});
	if (exitCode !== 0) {
		throw new Error(
			"cloudflared is not installed or not available in PATH. Install it with `brew install cloudflared`."
		);
	}
};

const startServerIfNeeded = async () => {
	if (await isServerReachable()) {
		return null;
	}
	if (!SHOULD_AUTO_START_SERVER) {
		throw new Error(
			`Webhook endpoint is not reachable at ${serverUrl}${WEBHOOK_PATH}. Start it first with npm -w @full-stack-cf-app/infra run dev or set CALENDAR_WEBHOOK_START_SERVER=1.`
		);
	}

	const serverProcess = spawn(
		"npm",
		["-w", "@full-stack-cf-app/infra", "run", "dev"],
		{
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				ALCHEMY_SKIP_WEB: "1",
			},
			detached: true,
		}
	);

	const forwardAndParseServerLogs = (buffer, stream) => {
		const text = buffer.toString();
		stream.write(text);
		if (!configuredServerUrl) {
			const parsedServerUrl = extractServerUrl(text);
			if (parsedServerUrl) {
				serverUrl = parsedServerUrl;
			}
		}
	};

	serverProcess.stdout.on("data", (buffer) =>
		forwardAndParseServerLogs(buffer, process.stdout)
	);
	serverProcess.stderr.on("data", (buffer) =>
		forwardAndParseServerLogs(buffer, process.stderr)
	);

	const ready = await waitForServer();
	if (!ready) {
		serverProcess.kill("SIGTERM");
		throw new Error(
			`Timed out waiting for webhook endpoint at ${serverUrl}${WEBHOOK_PATH}. Check 'npm run dev:server' logs.`
		);
	}

	return serverProcess;
};

const startTunnel = async () => {
	const tunnelProcess = spawn(
		"cloudflared",
		["tunnel", "--url", serverUrl, "--no-autoupdate"],
		{
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
			detached: true,
		}
	);

	let tunnelUrl;
	const outputChunks = [];
	const onData = (buffer) => {
		const text = buffer.toString();
		outputChunks.push(text);
		const match = text.match(TRYCLOUDFLARE_URL_REGEX);
		if (match && !tunnelUrl) {
			tunnelUrl = match[0];
		}
	};

	tunnelProcess.stdout.on("data", onData);
	tunnelProcess.stderr.on("data", onData);

	const startAt = Date.now();
	while (!tunnelUrl && Date.now() - startAt < TUNNEL_READY_TIMEOUT_MS) {
		if (tunnelProcess.exitCode !== null) {
			break;
		}
		await wait(500);
	}

	if (!tunnelUrl) {
		tunnelProcess.kill("SIGTERM");
		throw new Error(
			`Failed to acquire a trycloudflare URL. cloudflared output:\n${outputChunks.join("")}`
		);
	}

	return {
		tunnelProcess,
		tunnelUrl,
	};
};

const runWebhookIntegrationTest = async (webhookUrl) => {
	const commandEnv = {
		...process.env,
		RUN_NETWORK_TESTS: "1",
		RUN_WEBHOOK_NETWORK_TESTS: "1",
		GOOGLE_CALENDAR_TEST_WEBHOOK_URL: `${webhookUrl}${WEBHOOK_PATH}`,
	};

	const child = spawn("npm", ["run", "test:integration:calendar:webhook"], {
		stdio: "inherit",
		env: commandEnv,
	});

	return await new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => {
			resolve(code ?? 1);
		});
	});
};

let serverProcess;
let tunnelProcess;

try {
	await ensureCloudflaredInstalled();
	serverProcess = await startServerIfNeeded();

	const tunnel = await startTunnel();
	tunnelProcess = tunnel.tunnelProcess;

	console.log(
		`Using server ${serverUrl} and webhook URL ${tunnel.tunnelUrl}${WEBHOOK_PATH} for Google webhook integration test.`
	);

	const exitCode = await runWebhookIntegrationTest(tunnel.tunnelUrl);
	if (exitCode !== 0) {
		process.exitCode = exitCode;
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	await terminateProcess(tunnelProcess, "cloudflared tunnel");
	await terminateProcess(serverProcess, "dev:server");
}
