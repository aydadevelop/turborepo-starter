import http from "node:http";
import ngrok from "@ngrok/ngrok";
import httpProxy from "http-proxy";

interface TunnelRoute {
	prefix: string;
	target: string;
}

export interface TunnelOptions {
	/** Stable ngrok domain to claim (omit for random) */
	ngrokDomain?: string;
	/** Local port for the reverse proxy (default: 4040) */
	proxyPort?: number;
	/** URLs of services to proxy */
	upstreams: {
		web?: string;
		server: string;
		notifications: string;
		assistant: string;
	};
}

/**
 * Starts a local reverse-proxy and opens an ngrok tunnel.
 * Returns the public ngrok URL.
 */
export function startTunnel(opts: TunnelOptions): Promise<string> {
	const port = opts.proxyPort ?? 4040;

	const routes: TunnelRoute[] = [
		{ prefix: "/server", target: opts.upstreams.server },
		{ prefix: "/notifications", target: opts.upstreams.notifications },
		{ prefix: "/assistant", target: opts.upstreams.assistant },
	];
	if (opts.upstreams.web) {
		routes.unshift({ prefix: "/web", target: opts.upstreams.web });
	}

	const proxy = httpProxy.createProxyServer({ changeOrigin: true });

	proxy.on("error", (err, _req, res) => {
		console.error("[tunnel] upstream error:", err.message);
		if ("writeHead" in res && typeof res.writeHead === "function") {
			res.writeHead(502, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "upstream_unavailable" }));
		}
	});

	const httpServer = http.createServer((req, res) => {
		const url = req.url ?? "/";

		for (const route of routes) {
			if (url.startsWith(route.prefix)) {
				// For web, keep the prefix (SvelteKit uses paths.base)
				// For server/notifications, strip the prefix
				if (route.prefix !== "/web") {
					req.url = url.slice(route.prefix.length) || "/";
				}
				proxy.web(req, res, { target: route.target });
				return;
			}
		}

		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({
				status: "ok",
				routes: routes.map((r) => ({ path: r.prefix, upstream: r.target })),
			}),
		);
	});

	httpServer.on("upgrade", (req, socket, head) => {
		const url = req.url ?? "/";
		for (const route of routes) {
			if (url.startsWith(route.prefix)) {
				if (route.prefix !== "/web") {
					req.url = url.slice(route.prefix.length) || "/";
				}
				proxy.ws(req, socket, head, { target: route.target });
				return;
			}
		}
		socket.destroy();
	});

	return new Promise((resolve, reject) => {
		httpServer.listen(port, async () => {
			console.log(`[tunnel] proxy listening on http://localhost:${port}`);
			for (const r of routes) {
				console.log(`  ${r.prefix}/* -> ${r.target}`);
			}

			try {
				const listener = await ngrok.forward({
					addr: port,
					authtoken_from_env: true,
					domain: opts.ngrokDomain,
				});

				const publicUrl = listener.url() ?? "";
				console.log(`\n[tunnel] ngrok ingress: ${publicUrl}`);
				for (const r of routes) {
					console.log(`  ${publicUrl}${r.prefix} -> ${r.target}`);
				}
				resolve(publicUrl);
			} catch (err) {
				reject(err);
			}
		});
	});
}
