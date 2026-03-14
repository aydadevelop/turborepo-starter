import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { LISTING_PUBLIC_STORAGE_PROVIDER } from "../packages/storage/src/constants";
import { startTunnel } from "../packages/proxy/src/tunnel";

type TunnelMode = "ingress" | "legacy";

interface CliOptions {
	mode: TunnelMode;
	ngrokDomain?: string;
	proxyPort?: number;
	reuseServices: boolean;
}

const DEFAULT_ASSISTANT_PORT = 3001;
const DEFAULT_NOTIFICATIONS_PORT = 3002;
const DEFAULT_PROXY_PORT = 4040;
const DEFAULT_SERVER_PORT = 3000;
const DEFAULT_WEB_PORT = 5173;
const TRAILING_SLASHES_RE = /\/+$/;

const rootDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

const parseArgs = (argv: string[]): CliOptions => {
	const options: CliOptions = {
		mode: "ingress",
		reuseServices: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--reuse-services") {
			options.reuseServices = true;
			continue;
		}
		if (arg === "--domain") {
			options.ngrokDomain = argv[index + 1];
			index += 1;
			continue;
		}
		if (arg === "--mode") {
			const mode = argv[index + 1];
			if (mode === "legacy" || mode === "ingress") {
				options.mode = mode;
			}
			index += 1;
			continue;
		}
		if (arg === "--proxy-port") {
			const rawPort = Number(argv[index + 1]);
			if (Number.isFinite(rawPort) && rawPort > 0) {
				options.proxyPort = rawPort;
			}
			index += 1;
		}
	}

	return options;
};

const parsePort = (value: string | undefined, fallback: number): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeBaseUrl = (value: string): string =>
	value.replace(TRAILING_SLASHES_RE, "");

const mergeCorsOrigins = (...origins: Array<string | undefined>): string => {
	const merged = new Set<string>();
	for (const originList of origins) {
		for (const origin of (originList ?? "")
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean)) {
			merged.add(origin);
		}
	}
	return [...merged].join(",");
};

const spawnCommand = (
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
) =>
	spawn(command, args, {
		cwd: rootDir,
		env,
		stdio: "inherit",
	});

const waitForExit = (child: ReturnType<typeof spawn>): Promise<number> =>
	new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (signal) {
				resolve(1);
				return;
			}
			resolve(code ?? 0);
		});
	});

const runOneShot = async (
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
): Promise<void> => {
	const child = spawnCommand(command, args, env);
	const code = await waitForExit(child);
	if (code !== 0) {
		throw new Error(`${command} ${args.join(" ")} exited with code ${code}`);
	}
};

const buildPublicEnv = (publicUrl: string, mode: TunnelMode): NodeJS.ProcessEnv => {
	const publicBaseUrl = normalizeBaseUrl(publicUrl);
	const serverBasePath = mode === "legacy" ? "/server" : "";

	return {
		BETTER_AUTH_URL: `${publicBaseUrl}${serverBasePath}/api/auth`,
		CORS_ORIGIN: mergeCorsOrigins(process.env.CORS_ORIGIN, publicBaseUrl),
		PUBLIC_ASSISTANT_URL: "/assistant",
		PUBLIC_SERVER_URL: serverBasePath || "/",
		STORAGE_PUBLIC_BASE_URL: `${publicBaseUrl}${serverBasePath}/assets/${LISTING_PUBLIC_STORAGE_PROVIDER}`,
	};
};

const formatWebAppUrl = (publicUrl: string, mode: TunnelMode): string => {
	const publicBaseUrl = normalizeBaseUrl(publicUrl);
	return mode === "legacy" ? `${publicBaseUrl}/web` : publicBaseUrl;
};

const printBanner = (publicUrl: string, mode: TunnelMode): void => {
	const publicBaseUrl = normalizeBaseUrl(publicUrl);
	const serverBasePath = mode === "legacy" ? "/server" : "";
	console.log("\n[public-dev] ready");
	console.log(`  App URL: ${formatWebAppUrl(publicBaseUrl, mode)}`);
	console.log(`  Better Auth URL: ${publicBaseUrl}${serverBasePath}/api/auth`);
	console.log(
		`  Google webhook URL: ${publicBaseUrl}${serverBasePath}/webhooks/calendar/google`,
	);
	console.log(`  Assistant RPC base: ${publicBaseUrl}/assistant/rpc`);
	console.log(
		`  Internal server still talks over: ${process.env.SERVER_URL ?? `http://localhost:${DEFAULT_SERVER_PORT}`}`,
	);
	console.log(
		"  Press Ctrl+C to stop the tunnel and all spawned dev processes.\n",
	);
};

const main = async (): Promise<void> => {
	loadEnv({ path: path.join(rootDir, ".env") });
	loadEnv({ path: path.join(rootDir, ".env.local"), override: true });

	const options = parseArgs(process.argv.slice(2));
	const serverPort = parsePort(process.env.SERVER_PORT, DEFAULT_SERVER_PORT);
	const webPort = parsePort(process.env.WEB_PORT, DEFAULT_WEB_PORT);
	const assistantPort = parsePort(
		process.env.ASSISTANT_PORT,
		DEFAULT_ASSISTANT_PORT,
	);
	const notificationsPort = parsePort(
		process.env.NOTIFICATIONS_PORT,
		DEFAULT_NOTIFICATIONS_PORT,
	);

	const tunnel = await startTunnel({
		mode: options.mode,
		ngrokAuthToken:
			process.env.NGROK_AUTHTOKEN ??
			process.env.NGROK_AUTH_TOKEN ??
			undefined,
		ngrokDomain: options.ngrokDomain ?? process.env.NGROK_DOMAIN_NAME,
		proxyPort: options.proxyPort ?? DEFAULT_PROXY_PORT,
		upstreams: {
			assistant: `http://localhost:${assistantPort}`,
			notifications: `http://localhost:${notificationsPort}`,
			server: `http://localhost:${serverPort}`,
			web: `http://localhost:${webPort}`,
		},
	});

	const publicEnv = buildPublicEnv(tunnel.publicUrl, options.mode);
	const childEnv: NodeJS.ProcessEnv = {
		...process.env,
		...publicEnv,
	};

	printBanner(tunnel.publicUrl, options.mode);

	let devProcess: ReturnType<typeof spawn> | undefined;
	let shuttingDown = false;
	const shutdown = async (exitCode = 0): Promise<void> => {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;
		if (devProcess && devProcess.exitCode === null) {
			devProcess.kill("SIGTERM");
		}
		await tunnel.close();
		process.exit(exitCode);
	};

	process.on("SIGINT", () => {
		void shutdown(0);
	});
	process.on("SIGTERM", () => {
		void shutdown(0);
	});

	if (options.reuseServices) {
		await new Promise<void>((resolve) => {
			process.once("SIGINT", () => resolve());
			process.once("SIGTERM", () => resolve());
		});
		await shutdown(0);
		return;
	}

	await runOneShot("bun", ["scripts/ensure-db.mjs"], childEnv);

	devProcess = spawnCommand(
		"bun",
		[
			"x",
			"turbo",
			"run",
			"dev",
			"--filter=server",
			"--filter=assistant",
			"--filter=notifications",
			"--filter=web",
		],
		childEnv,
	);

	const code = await waitForExit(devProcess);
	await shutdown(code);
};

void main().catch(async (error) => {
	console.error(
		"[public-dev] failed:",
		error instanceof Error ? error.message : String(error),
	);
	process.exit(1);
});
