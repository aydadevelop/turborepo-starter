/**
 * 2Captcha residential proxy client for Cloudflare Workers.
 *
 * Uses `generate_white_list_connections` to obtain ip:port proxy endpoints
 * that work without auth credentials from a pre-whitelisted egress IP.
 * The proxy list and ASNs are cached in KV (when available) to avoid
 * hitting the 2Captcha API on every Worker invocation.
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

/**
 * Minimal KV store interface — structurally compatible with CF KVNamespace.
 * Defined here so the youtube package avoids a hard dep on workers-types.
 */
export interface KVStore {
	delete?(key: string): Promise<void>;
	get<T>(key: string, options: { type: "json" }): Promise<T | null>;
	get(key: string, options?: { type?: "text" }): Promise<string | null>;
	put(
		key: string,
		value: string,
		options?: { expirationTtl?: number }
	): Promise<void>;
}

export interface ProxyEntry {
	host: string;
	port: number;
}

export interface ProxyAccountInfo {
	lastFlow: number | null;
	status: number;
	totalFlow: number;
	useFlow: number;
	username: string;
	whitelistedIps: string[];
}

export interface ProxyAsnEntry {
	code: string;
	countryCode: string;
	id: number;
	title: string;
}

// ─── KV keys and TTLs ─────────────────────────────────────────────────────────

const KV_KEY_PROXY_LIST = "2captcha:proxy-list";
const KV_KEY_ACCOUNT = "2captcha:account";
const KV_KEY_ASNS = "2captcha:asns";
const KV_KEY_BALANCE = "2captcha:balance";
const KV_KEY_INSUFFICIENT_FLOW = "2captcha:insufficient-flow";

const TTL_PROXY_LIST_SEC = 10 * 60; // 10 minutes — proxy IPs rotate
const TTL_ACCOUNT_SEC = 60 * 60; // 1 hour
const TTL_ASNS_SEC = 24 * 60 * 60; // 24 hours — mostly static
const TTL_BALANCE_SEC = 60; // 1 minute — should stay near-real-time
const INSUFFICIENT_FLOW_COOLDOWN_MS = 60 * 1000;

// ─── Module-level in-memory fallback (per Worker isolate) ────────────────────

interface MemCache {
	egressIp: string;
	fetchedAt: number;
	proxies: ProxyEntry[];
}

let memCache: MemCache = { proxies: [], egressIp: "", fetchedAt: 0 };
let insufficientFlowUntil = 0;
const MEM_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── 2Captcha API helpers ─────────────────────────────────────────────────────

const IPV4_SEGMENT_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)$/;

function isIpv4(ip: string): boolean {
	const parts = ip.split(".");
	return (
		parts.length === 4 && parts.every((part) => IPV4_SEGMENT_RE.test(part))
	);
}

function pickWhitelistedIpv4(ips: string[] | undefined): string | null {
	if (!Array.isArray(ips)) {
		return null;
	}
	for (const ip of ips) {
		if (typeof ip === "string" && isIpv4(ip.trim())) {
			return ip.trim();
		}
	}
	return null;
}

function trimErrorBody(body: string): string {
	const singleLine = body.replace(/\s+/g, " ").trim();
	if (singleLine.length <= 300) {
		return singleLine;
	}
	return `${singleLine.slice(0, 300)}…`;
}

async function discoverEgressIp(): Promise<string> {
	const endpoints = [
		"https://api4.ipify.org?format=json",
		"https://api.ipify.org?format=json",
	];
	const failures: string[] = [];

	for (const endpoint of endpoints) {
		try {
			const res = await fetch(endpoint);
			if (!res.ok) {
				failures.push(`${endpoint}: HTTP ${res.status}`);
				continue;
			}

			const data = (await res.json()) as { ip?: string };
			const ip = data.ip?.trim();
			if (!ip) {
				failures.push(`${endpoint}: missing ip field`);
				continue;
			}

			if (!isIpv4(ip)) {
				failures.push(`${endpoint}: non-IPv4 egress ${ip}`);
				continue;
			}

			return ip;
		} catch (e) {
			failures.push(`${endpoint}: ${e}`);
		}
	}

	throw new Error(
		"[proxy] Egress IPv4 discovery failed. " +
			"2Captcha whitelist API requires IPv4. " +
			`Details: ${failures.join(" | ")}`
	);
}

/**
 * Call `generate_white_list_connections` directly.
 *
 * The supplied `ip` must already be registered in the 2Captcha IP whitelist
 * (account settings page). Returns an empty array when the IP is not
 * whitelisted yet — the caller should display registration instructions.
 */
export async function generateWhitelistConnections(
	apiKey: string,
	ip: string,
	options?: {
		count?: number;
		country?: string;
		protocol?: "http" | "https" | "socks5";
	}
): Promise<ProxyEntry[]> {
	if (!isIpv4(ip)) {
		throw new Error(
			`[proxy] 2Captcha requires IPv4 in 'ip' param for whitelist connections. Received: ${ip}`
		);
	}

	const params = new URLSearchParams({
		key: apiKey,
		ip,
		protocol: options?.protocol ?? "http",
		connection_count: String(options?.count ?? 100),
	});
	if (options?.country) {
		params.set("country", options.country);
	}
	const res = await fetch(
		`https://api.2captcha.com/proxy/generate_white_list_connections?${params}`
	);
	if (!res.ok) {
		const bodyText = await res.text().catch(() => "");
		const bodySuffix = bodyText ? `, body: ${trimErrorBody(bodyText)}` : "";
		throw new Error(
			`[proxy] 2Captcha proxy API error: HTTP ${res.status}${bodySuffix}`
		);
	}
	const body = (await res.json()) as { status: string; data: string[] };
	if (body.status !== "OK") {
		throw new Error(`[proxy] 2Captcha responded with status: ${body.status}`);
	}
	return body.data.map((entry) => {
		const colonIdx = entry.lastIndexOf(":");
		const host = entry.slice(0, colonIdx);
		const port = Number(entry.slice(colonIdx + 1));
		return { host, port };
	});
}

function fetchProxyConnections(
	apiKey: string,
	egressIp: string,
	count = 100
): Promise<ProxyEntry[]> {
	return generateWhitelistConnections(apiKey, egressIp, { count });
}

async function fetchProxyListViaDiscoveredEgress(
	apiKey: string
): Promise<{ ip: string | null; proxies: ProxyEntry[] }> {
	try {
		const ip = await discoverEgressIp();
		console.log(`[proxy] Egress IPv4: ${ip} — fetching proxy list`);
		const proxies = await fetchProxyConnections(apiKey, ip);
		console.log(
			`[proxy] Received ${proxies.length} proxy endpoints from egress IP`
		);
		return { ip, proxies };
	} catch (error) {
		console.warn(
			"[proxy] Primary proxy fetch via discovered egress IP failed:",
			error
		);
		return { ip: null, proxies: [] };
	}
}

async function fetchProxyListViaAccountWhitelist(
	apiKey: string,
	kv: KVStore | undefined,
	skipIp: string | null
): Promise<{ ip: string | null; proxies: ProxyEntry[] }> {
	const account = await fetchAccountInfo(apiKey, kv);
	const fallbackIp = pickWhitelistedIpv4(account?.whitelistedIps);

	if (!fallbackIp) {
		console.warn(
			"[proxy] No IPv4 found in 2Captcha account whitelist for fallback"
		);
		return { ip: null, proxies: [] };
	}

	if (fallbackIp === skipIp) {
		return { ip: fallbackIp, proxies: [] };
	}

	console.log(`[proxy] Retrying with account whitelisted IPv4: ${fallbackIp}`);

	try {
		const proxies = await fetchProxyConnections(apiKey, fallbackIp);
		console.log(
			`[proxy] Received ${proxies.length} proxy endpoints from account whitelist IP`
		);
		return { ip: fallbackIp, proxies };
	} catch (error) {
		console.warn(
			"[proxy] Fallback proxy fetch via account whitelisted IP failed:",
			error
		);
		return { ip: fallbackIp, proxies: [] };
	}
}

function sameProxyEntry(a: ProxyEntry, b: ProxyEntry): boolean {
	return a.host === b.host && a.port === b.port;
}

function pickRandomProxy(proxies: ProxyEntry[]): ProxyEntry | null {
	return proxies[Math.floor(Math.random() * proxies.length)] ?? null;
}

async function getProxyFromKvCache(kv?: KVStore): Promise<ProxyEntry | null> {
	if (!kv) {
		return null;
	}

	try {
		const cached = await kv.get<{
			proxies: ProxyEntry[];
			egressIp: string;
		}>(KV_KEY_PROXY_LIST, { type: "json" });
		if (!cached?.proxies?.length) {
			return null;
		}
		return pickRandomProxy(cached.proxies);
	} catch (e) {
		console.warn("[proxy] KV proxy-list read error:", e);
		return null;
	}
}

function getProxyFromMemCache(now: number): ProxyEntry | null {
	if (memCache.proxies.length === 0) {
		return null;
	}

	if (now - memCache.fetchedAt >= MEM_TTL_MS) {
		return null;
	}

	return pickRandomProxy(memCache.proxies);
}

async function resolveFreshProxyList(
	apiKey: string,
	kv?: KVStore
): Promise<{ proxies: ProxyEntry[]; resolvedIp: string | null }> {
	const primary = await fetchProxyListViaDiscoveredEgress(apiKey);
	if (primary.proxies.length > 0) {
		return { proxies: primary.proxies, resolvedIp: primary.ip };
	}

	const fallback = await fetchProxyListViaAccountWhitelist(
		apiKey,
		kv,
		primary.ip
	);
	if (fallback.proxies.length > 0) {
		return { proxies: fallback.proxies, resolvedIp: fallback.ip };
	}

	return { proxies: [], resolvedIp: primary.ip ?? fallback.ip };
}

async function cacheResolvedProxyList(
	proxies: ProxyEntry[],
	resolvedIp: string,
	now: number,
	kv?: KVStore
): Promise<void> {
	if (kv) {
		await kv
			.put(
				KV_KEY_PROXY_LIST,
				JSON.stringify({ proxies, egressIp: resolvedIp }),
				{
					expirationTtl: TTL_PROXY_LIST_SEC,
				}
			)
			.catch((e) => console.warn("[proxy] KV proxy-list write error:", e));
	}

	memCache = { proxies, egressIp: resolvedIp, fetchedAt: now };
}

async function getCachedBalance(kv?: KVStore): Promise<number | null> {
	if (!kv) {
		return null;
	}

	try {
		const cached = await kv.get<{ balance: number }>(KV_KEY_BALANCE, {
			type: "json",
		});
		return typeof cached?.balance === "number" ? cached.balance : null;
	} catch {
		return null;
	}
}

async function setCachedBalance(
	kv: KVStore | undefined,
	balance: number
): Promise<void> {
	if (!kv) {
		return;
	}

	await kv
		.put(KV_KEY_BALANCE, JSON.stringify({ balance }), {
			expirationTtl: TTL_BALANCE_SEC,
		})
		.catch((e) => console.warn("[proxy] KV balance write error:", e));
}

async function getInsufficientFlowMarker(
	kv?: KVStore,
): Promise<{ until: number } | null> {
	if (!kv) return null;
	try {
		const marker = await kv.get<{ until?: number }>(KV_KEY_INSUFFICIENT_FLOW, {
			type: "json",
		});
		if (!marker) return null;
		// If `until` was stored, use it; otherwise treat as a legacy marker and
		// apply a conservative default of now + full cooldown.
		const until = typeof marker.until === "number" ? marker.until : Date.now() + INSUFFICIENT_FLOW_COOLDOWN_MS;
		return { until };
	} catch {
		return null;
	}
}

async function clearInsufficientFlowMarker(kv?: KVStore): Promise<void> {
	if (!kv?.delete) {
		return;
	}

	await kv.delete(KV_KEY_INSUFFICIENT_FLOW).catch((e) => {
		console.warn("[proxy] Failed to clear insufficient-flow marker:", e);
	});
}

function inInsufficientFlowCooldown(now: number): boolean {
	return now < insufficientFlowUntil;
}

/**
 * Mark proxy provider as temporarily unavailable due to insufficient flow.
 * This prevents repeated failing CONNECT attempts for a short interval.
 */
export async function markProxyInsufficientFlow(
	kv?: KVStore,
	reason?: string,
): Promise<void> {
	const now = Date.now();
	insufficientFlowUntil = now + INSUFFICIENT_FLOW_COOLDOWN_MS;
	const reasonSuffix = reason ? ` reason=${JSON.stringify(reason.slice(0, 200))}` : "";
	console.warn(
		`[proxy] Marking insufficient-flow cooldown until ${new Date(insufficientFlowUntil).toISOString()} (${INSUFFICIENT_FLOW_COOLDOWN_MS / 1000}s)${reasonSuffix}`,
	);

	if (!kv) return;

	await kv
		.put(
			KV_KEY_INSUFFICIENT_FLOW,
			JSON.stringify({ until: insufficientFlowUntil }),
			{
				expirationTtl: Math.ceil(INSUFFICIENT_FLOW_COOLDOWN_MS / 1000),
			}
		)
		.catch((e) =>
			console.warn("[proxy] Failed to persist insufficient-flow marker:", e)
		);
}

function recheckLiveBalance(apiKey: string): Promise<number | null> {
	return fetchBalance(apiKey);
}

async function shouldSkipProxyDueToKnownZeroBalance(
	apiKey: string,
	now: number,
	kv?: KVStore
): Promise<boolean> {
	if (inInsufficientFlowCooldown(now)) {
		const remainingSec = Math.ceil((insufficientFlowUntil - now) / 1000);
		console.warn(
			`[proxy] Skipping proxy — insufficient-flow cooldown active, ${remainingSec}s remaining (until ${new Date(insufficientFlowUntil).toISOString()})`,
		);
		return true;
	}

	const kvMarker = await getInsufficientFlowMarker(kv);
	if (kvMarker) {
		if (kvMarker.until <= now) {
			// KV TTL hasn't evicted it yet but the until timestamp already passed
			await clearInsufficientFlowMarker(kv);
		} else {
			// Restore in-memory state from KV using the stored until timestamp
			insufficientFlowUntil = kvMarker.until;
			const remainingSec = Math.ceil((kvMarker.until - now) / 1000);
			console.warn(
				`[proxy] Skipping proxy — restored insufficient-flow marker from KV, ${remainingSec}s remaining (until ${new Date(kvMarker.until).toISOString()})`,
			);
			return true;
		}
	}

	const cachedBalance = await getCachedBalance(kv);
	if (cachedBalance === null || cachedBalance > 0) {
		return false;
	}

	const liveBalance = await recheckLiveBalance(apiKey);
	if (liveBalance !== null && liveBalance > 0) {
		await setCachedBalance(kv, liveBalance);
		await clearInsufficientFlowMarker(kv);
		console.log(
			`[proxy] Balance recheck recovered (${liveBalance}) — re-enabling proxy usage`
		);
		return false;
	}

	if (liveBalance !== null && liveBalance <= 0) {
		await markProxyInsufficientFlow(kv);
		await setCachedBalance(kv, liveBalance);
		console.warn(
			`[proxy] Confirmed 2Captcha balance is ${liveBalance} — skipping proxy usage`
		);
		return true;
	}

	console.warn(
		"[proxy] Cached balance is zero but live recheck failed; attempting proxy anyway"
	);
	return false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch and cache 2Captcha account info.
 * Stores: username, status, traffic usage, whitelisted IPs.
 */
export async function fetchAccountInfo(
	apiKey: string,
	kv?: KVStore
): Promise<ProxyAccountInfo | null> {
	if (kv) {
		try {
			const cached = await kv.get<ProxyAccountInfo>(KV_KEY_ACCOUNT, {
				type: "json",
			});
			if (cached) {
				return cached;
			}
		} catch (e) {
			console.warn("[proxy] KV account read error:", e);
		}
	}
	try {
		const res = await fetch(`https://api.2captcha.com/proxy?key=${apiKey}`);
		if (!res.ok) {
			return null;
		}
		const body = (await res.json()) as {
			status: string;
			data: {
				last_flow?: number;
				username: string;
				status: number;
				total_flow: number;
				use_flow: number;
				ip_white: string[];
			};
		};
		if (body.status !== "OK" || !body.data || typeof body.data !== "object") {
			return null;
		}
		const whitelistedIps = Array.isArray(body.data.ip_white)
			? body.data.ip_white.filter((ip): ip is string => typeof ip === "string")
			: [];
		const info: ProxyAccountInfo = {
			lastFlow: body.data.last_flow ?? null,
			username: body.data.username,
			status: body.data.status,
			totalFlow: body.data.total_flow,
			useFlow: body.data.use_flow,
			whitelistedIps,
		};
		if (kv) {
			await kv
				.put(KV_KEY_ACCOUNT, JSON.stringify(info), {
					expirationTtl: TTL_ACCOUNT_SEC,
				})
				.catch((e) => console.warn("[proxy] KV account write error:", e));
		}
		return info;
	} catch (e) {
		console.warn("[proxy] fetchAccountInfo error:", e);
		return null;
	}
}

/**
 * Fetch and cache current 2Captcha proxy balance.
 * Cached briefly to avoid frequent balance polling.
 */
export async function fetchBalance(
	apiKey: string,
	kv?: KVStore
): Promise<number | null> {
	if (kv) {
		try {
			const cached = await kv.get<{ balance: number }>(KV_KEY_BALANCE, {
				type: "json",
			});
			if (typeof cached?.balance === "number") {
				return cached.balance;
			}
		} catch (e) {
			console.warn("[proxy] KV balance read error:", e);
		}
	}

	try {
		const res = await fetch(
			`https://api.2captcha.com/proxy/balance?key=${apiKey}`
		);
		if (!res.ok) {
			return null;
		}

		const body = (await res.json()) as {
			status: string;
			balance?: number;
		};
		if (body.status !== "OK" || typeof body.balance !== "number") {
			return null;
		}

		if (kv) {
			await setCachedBalance(kv, body.balance);
			if (body.balance > 0) {
				await clearInsufficientFlowMarker(kv);
			}
		}

		return body.balance;
	} catch (e) {
		console.warn("[proxy] fetchBalance error:", e);
		return null;
	}
}

/**
 * Fetch and cache the list of ASNs available from 2Captcha (page 0).
 * These are relatively static — cached for 24 hours.
 */
export async function fetchAsns(
	apiKey: string,
	kv?: KVStore
): Promise<ProxyAsnEntry[]> {
	if (kv) {
		try {
			const cached = await kv.get<ProxyAsnEntry[]>(KV_KEY_ASNS, {
				type: "json",
			});
			if (cached && cached.length > 0) {
				return cached;
			}
		} catch (e) {
			console.warn("[proxy] KV ASN read error:", e);
		}
	}
	try {
		const res = await fetch(
			`https://api.2captcha.com/proxy/locations/asns?key=${apiKey}&page=0`
		);
		if (!res.ok) {
			return [];
		}
		const body = (await res.json()) as {
			status: string;
			data: ProxyAsnEntry[];
		};
		if (body.status !== "OK") {
			return [];
		}
		if (kv && body.data.length > 0) {
			await kv
				.put(KV_KEY_ASNS, JSON.stringify(body.data), {
					expirationTtl: TTL_ASNS_SEC,
				})
				.catch((e) => console.warn("[proxy] KV ASN write error:", e));
		}
		return body.data;
	} catch (e) {
		console.warn("[proxy] fetchAsns error:", e);
		return [];
	}
}

/**
 * Get a residential proxy entry for routing requests through 2Captcha.
 *
 * Cache priority: KV (cross-invocation) → in-memory (same isolate) → fresh fetch.
 * Returns null if the proxy list is empty or the 2Captcha API is unreachable.
 */
export async function getProxy(
	apiKey: string,
	kv?: KVStore
): Promise<ProxyEntry | null> {
	const now = Date.now();

	if (await shouldSkipProxyDueToKnownZeroBalance(apiKey, now, kv)) {
		return null;
	}

	// 1. Try KV cache (survives across isolate cold-starts)
	const kvPick = await getProxyFromKvCache(kv);
	if (kvPick) {
		return kvPick;
	}

	// 2. Try module-level in-memory cache (same isolate, multiple requests)
	const memPick = getProxyFromMemCache(now);
	if (memPick) {
		return memPick;
	}

	// 3. Fetch fresh: discover egress IP → generate whitelist connections
	try {
		const { proxies, resolvedIp } = await resolveFreshProxyList(apiKey, kv);

		if (proxies.length === 0) {
			console.warn(
				"[proxy] 2Captcha returned 0 proxies — whitelist IPv4 may be missing or traffic quota exhausted"
			);
			return null;
		}

		if (!resolvedIp) {
			console.warn(
				"[proxy] Proxy list resolved without a source IP marker; skipping cache write"
			);
			const pick = pickRandomProxy(proxies);
			memCache = { proxies, egressIp: "", fetchedAt: now };
			return pick;
		}

		await cacheResolvedProxyList(proxies, resolvedIp, now, kv);

		return pickRandomProxy(proxies);
	} catch (e) {
		console.warn("[proxy] Failed to fetch proxy list:", e);
		return null;
	}
}

/**
 * Safely evict only the failed proxy endpoint from caches.
 *
 * Strategy:
 * - Remove just the failing proxy from in-memory cache.
 * - Remove just the failing proxy from KV cached list when possible.
 * - Keep remaining proxies intact to avoid cache-thrashing.
 */
export async function evictFailedProxy(
	failed: ProxyEntry,
	kv?: KVStore
): Promise<void> {
	// 1) In-memory cache: drop only failed endpoint
	if (memCache.proxies.length > 0) {
		const next = memCache.proxies.filter((p) => !sameProxyEntry(p, failed));
		if (next.length !== memCache.proxies.length) {
			memCache = {
				...memCache,
				proxies: next,
				fetchedAt: Date.now(),
			};
		}
	}

	if (!kv) {
		return;
	}

	// 2) KV cache: drop only failed endpoint
	try {
		const cached = await kv.get<{ egressIp: string; proxies: ProxyEntry[] }>(
			KV_KEY_PROXY_LIST,
			{ type: "json" }
		);
		if (!cached?.proxies || cached.proxies.length === 0) {
			return;
		}

		const next = cached.proxies.filter((p) => !sameProxyEntry(p, failed));
		if (next.length === cached.proxies.length) {
			return;
		}

		if (next.length === 0) {
			if (kv.delete) {
				await kv.delete(KV_KEY_PROXY_LIST);
				return;
			}
			// Fallback for KV-like stores without delete()
			await kv.put(
				KV_KEY_PROXY_LIST,
				JSON.stringify({ egressIp: cached.egressIp, proxies: [] }),
				{ expirationTtl: 30 }
			);
			return;
		}

		await kv.put(
			KV_KEY_PROXY_LIST,
			JSON.stringify({ egressIp: cached.egressIp, proxies: next }),
			{ expirationTtl: TTL_PROXY_LIST_SEC }
		);
	} catch (e) {
		console.warn("[proxy] Failed to evict proxy from KV cache:", e);
	}
}

/** Invalidate the in-memory proxy cache (e.g. when a proxy fails). */
export function invalidateProxyCache(): void {
	memCache = { proxies: [], egressIp: "", fetchedAt: 0 };
	insufficientFlowUntil = 0;
}
