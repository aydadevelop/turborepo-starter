import http from "node:http";
import ngrok from "@ngrok/ngrok";
import httpProxy from "http-proxy";

type TunnelMode = "ingress" | "legacy";

interface RouteDefinition {
	label: string;
	match: string | "*";
	target: string;
	stripPrefix?: boolean;
}

export interface TunnelRouteSummary {
	label: string;
	match: string | "*";
	stripPrefix: boolean;
	target: string;
}

export interface TunnelHandle {
	close: () => Promise<void>;
	proxyUrl: string;
	publicUrl: string;
	routes: TunnelRouteSummary[];
}

export interface TunnelOptions {
	/** Path that returns proxy diagnostics instead of forwarding to an upstream. */
	debugPath?: string;
	/** Explicit ngrok auth token. Falls back to NGROK_AUTHTOKEN or NGROK_AUTH_TOKEN. */
	ngrokAuthToken?: string;
	/** Stable ngrok domain to claim (omit for random). */
	ngrokDomain?: string;
	/** Routing strategy. "ingress" mirrors production-style edge routing. */
	mode?: TunnelMode;
	/** Local port for the reverse proxy (default: 4040). */
	proxyPort?: number;
	/** URLs of services to proxy. */
	upstreams: {
		assistant?: string;
		notifications?: string;
		server: string;
		web?: string;
	};
}

const DEFAULT_DEBUG_PATH = "/__proxy";
const DEFAULT_PROXY_PORT = 4040;

const normalizeUrlPrefix = (prefix: string): string => {
	if (prefix === "/") {
		return "/";
	}
	return `/${prefix.replace(/^\/+|\/+$/g, "")}`;
};

const matchesRoute = (url: string, match: string | "*"): boolean => {
	if (match === "*") {
		return true;
	}
	if (match === "/") {
		return url === "/";
	}
	return url === match || url.startsWith(`${match}/`) || url.startsWith(`${match}?`);
};

const stripMatchedPrefix = (url: string, match: string | "*"): string => {
	if (match === "*" || match === "/") {
		return url;
	}
	const stripped = url.slice(match.length);
	if (stripped.length === 0) {
		return "/";
	}
	if (stripped.startsWith("?")) {
		return `/${stripped}`;
	}
	return stripped.startsWith("/") ? stripped : `/${stripped}`;
};

const buildLegacyRoutes = (opts: TunnelOptions): RouteDefinition[] => {
	const routes: RouteDefinition[] = [];
	if (opts.upstreams.web) {
		routes.push({
			label: "web",
			match: "/web",
			stripPrefix: false,
			target: opts.upstreams.web,
		});
	}
	routes.push({
		label: "server",
		match: "/server",
		stripPrefix: true,
		target: opts.upstreams.server,
	});
	if (opts.upstreams.notifications) {
		routes.push({
			label: "notifications",
			match: "/notifications",
			stripPrefix: true,
			target: opts.upstreams.notifications,
		});
	}
	if (opts.upstreams.assistant) {
		routes.push({
			label: "assistant",
			match: "/assistant",
			stripPrefix: true,
			target: opts.upstreams.assistant,
		});
	}
	return routes;
};

const buildIngressRoutes = (opts: TunnelOptions): RouteDefinition[] => {
	const routes: RouteDefinition[] = [];
	if (opts.upstreams.assistant) {
		routes.push({
			label: "assistant",
			match: "/assistant",
			stripPrefix: true,
			target: opts.upstreams.assistant,
		});
	}
	if (opts.upstreams.notifications) {
		routes.push({
			label: "notifications",
			match: "/notifications",
			stripPrefix: true,
			target: opts.upstreams.notifications,
		});
	}
	for (const match of [
		"/api",
		"/rpc",
		"/webhooks",
		"/assets",
		"/health",
		"/metrics",
		"/api-reference",
	]) {
		routes.push({
			label: "server",
			match,
			stripPrefix: false,
			target: opts.upstreams.server,
		});
	}
	if (opts.upstreams.web) {
		routes.push({
			label: "web",
			match: "*",
			stripPrefix: false,
			target: opts.upstreams.web,
		});
	}
	return routes;
};

const buildRoutes = (opts: TunnelOptions): RouteDefinition[] => {
	const mode = opts.mode ?? "ingress";
	return mode === "legacy" ? buildLegacyRoutes(opts) : buildIngressRoutes(opts);
};

const toRouteSummary = (route: RouteDefinition): TunnelRouteSummary => ({
	label: route.label,
	match: route.match,
	stripPrefix: route.stripPrefix ?? false,
	target: route.target,
});

const resolveRoute = (
	url: string,
	routes: RouteDefinition[],
): RouteDefinition | undefined => {
	for (const route of routes) {
		if (matchesRoute(url, route.match)) {
			return route;
		}
	}
	return undefined;
};

/**
 * Starts a local reverse proxy and opens an ngrok tunnel.
 *
 * In "ingress" mode it mirrors a production-like edge:
 * - /api, /rpc, /webhooks, /assets, /health, /metrics -> server
 * - /assistant -> assistant
 * - /notifications -> notifications
 * - everything else -> web
 */
export async function startTunnel(
	opts: TunnelOptions,
): Promise<TunnelHandle> {
	const port = opts.proxyPort ?? DEFAULT_PROXY_PORT;
	const debugPath = normalizeUrlPrefix(opts.debugPath ?? DEFAULT_DEBUG_PATH);
	const routes = buildRoutes(opts);
	const routeSummaries = routes.map(toRouteSummary);
	const proxy = httpProxy.createProxyServer({
		changeOrigin: true,
		xfwd: true,
		ws: true,
	});

	proxy.on("error", (err, _req, res) => {
		console.error("[tunnel] upstream error:", err.message);
		if ("writeHead" in res && typeof res.writeHead === "function") {
			res.writeHead(502, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "upstream_unavailable" }));
		}
	});

	const proxyUrl = `http://localhost:${port}`;
	const httpServer = http.createServer((req, res) => {
		const originalUrl = req.url ?? "/";

		if (matchesRoute(originalUrl, debugPath)) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					debugPath,
					proxyUrl,
					routes: routeSummaries,
					status: "ok",
				}),
			);
			return;
		}

		const route = resolveRoute(originalUrl, routes);
		if (!route) {
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "route_not_configured" }));
			return;
		}

		if (route.stripPrefix) {
			req.url = stripMatchedPrefix(originalUrl, route.match);
		}
		proxy.web(req, res, { target: route.target });
	});

	httpServer.on("upgrade", (req, socket, head) => {
		const originalUrl = req.url ?? "/";
		const route = resolveRoute(originalUrl, routes);
		if (!route) {
			socket.destroy();
			return;
		}

		if (route.stripPrefix) {
			req.url = stripMatchedPrefix(originalUrl, route.match);
		}
		proxy.ws(req, socket, head, { target: route.target });
	});

	await new Promise<void>((resolve, reject) => {
		httpServer.once("error", reject);
		httpServer.listen(port, () => {
			httpServer.off("error", reject);
			resolve();
		});
	});

	console.log(`[tunnel] proxy listening on ${proxyUrl}`);
	for (const route of routeSummaries) {
		console.log(
			`  ${route.match} -> ${route.target}${route.stripPrefix ? " (strip prefix)" : ""}`,
		);
	}
	console.log(`  ${debugPath} -> proxy diagnostics`);

	const listener = await ngrok.forward({
		addr: port,
		authtoken:
			opts.ngrokAuthToken ??
			process.env.NGROK_AUTHTOKEN ??
			process.env.NGROK_AUTH_TOKEN ??
			undefined,
		domain: opts.ngrokDomain,
	});

	const publicUrl = (listener.url() ?? "").replace(/\/+$/g, "");
	console.log(`\n[tunnel] ngrok ingress: ${publicUrl}`);
	for (const route of routeSummaries) {
		const match = route.match === "*" ? "/*" : route.match;
		console.log(`  ${publicUrl}${match} -> ${route.target}`);
	}
	console.log(`  ${publicUrl}${debugPath} -> proxy diagnostics`);

	return {
		close: async () => {
			await Promise.allSettled([
				new Promise<void>((resolve, reject) => {
					httpServer.close((error) => {
						if (error) {
							reject(error);
							return;
						}
						resolve();
					});
				}),
				Promise.resolve(
					"close" in listener && typeof listener.close === "function"
						? listener.close()
						: undefined,
				),
			]);
		},
		proxyUrl,
		publicUrl,
		routes: routeSummaries,
	};
}
