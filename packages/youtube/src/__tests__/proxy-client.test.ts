import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	evictFailedProxy,
	fetchAccountInfo,
	fetchAsns,
	fetchBalance,
	getProxy,
	invalidateProxyCache,
	markProxyInsufficientFlow,
} = await import("../proxy-client");

// ─── KV mock ─────────────────────────────────────────────────────────────────

function makeKv(initial: Record<string, string> = {}) {
	const store = new Map<string, string>(Object.entries(initial));
	return {
		get<T>(key: string, opts?: { type?: string }): Promise<T | null> {
			const val = store.get(key);
			if (val === undefined) {
				return Promise.resolve(null);
			}
			if (opts?.type === "json") {
				return Promise.resolve(JSON.parse(val) as T);
			}
			return Promise.resolve(val as unknown as T);
		},
		put(key: string, value: string): Promise<void> {
			store.set(key, value);
			return Promise.resolve();
		},
		delete(key: string): Promise<void> {
			store.delete(key);
			return Promise.resolve();
		},
		store,
	};
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNT_API_RESPONSE = {
	status: "OK",
	data: {
		username: "testuser",
		status: 1,
		last_flow: 150,
		total_flow: 1000,
		use_flow: 200,
		ip_white: ["1.2.3.4"],
	},
};

const ACCOUNT_INFO_PARSED = {
	lastFlow: 150,
	username: "testuser",
	status: 1,
	totalFlow: 1000,
	useFlow: 200,
	whitelistedIps: ["1.2.3.4"],
};

const BALANCE_API_RESPONSE = { status: "OK", balance: 123.45 };

const ASNS_DATA = [
	{ id: 1, code: "AS1234", countryCode: "US", title: "Test ASN" },
];

const ASNS_API_RESPONSE = { status: "OK", data: ASNS_DATA };

const PROXY_LIST_RESPONSE = {
	status: "OK",
	data: ["10.0.0.1:8080", "10.0.0.2:8081"],
};

const EGRESS_IP_RESPONSE = { ip: "99.88.77.66" };
const IPV6_EGRESS_RESPONSE = { ip: "2a06:98c0:3600::103" };

function mockProxyFetch() {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string) => {
			if ((url as string).includes("ipify.org")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(EGRESS_IP_RESPONSE),
				});
			}
			if ((url as string).includes("generate_white_list_connections")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(PROXY_LIST_RESPONSE),
				});
			}
			return Promise.resolve({ ok: false, status: 404 });
		})
	);
}

// ─── fetchAccountInfo ─────────────────────────────────────────────────────────

describe("fetchAccountInfo", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns cached value from KV without calling fetch", async () => {
		const kv = makeKv({
			"2captcha:account": JSON.stringify(ACCOUNT_INFO_PARSED),
		});
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchAccountInfo("testkey", kv);

		expect(result).toEqual(ACCOUNT_INFO_PARSED);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("fetches from API on KV miss and writes result back to KV", async () => {
		const kv = makeKv();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(ACCOUNT_API_RESPONSE),
			})
		);

		const result = await fetchAccountInfo("testkey", kv);

		expect(result).toEqual(ACCOUNT_INFO_PARSED);
		const stored = JSON.parse(kv.store.get("2captcha:account") ?? "null");
		expect(stored).toEqual(ACCOUNT_INFO_PARSED);
	});

	it("returns null when API responds with non-OK status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 500 })
		);

		const result = await fetchAccountInfo("testkey");

		expect(result).toBeNull();
	});

	it("returns null when API body status is not OK", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ status: "ERROR", data: null }),
			})
		);

		const result = await fetchAccountInfo("testkey");

		expect(result).toBeNull();
	});

	it("works without KV and skips caching", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(ACCOUNT_API_RESPONSE),
			})
		);

		const result = await fetchAccountInfo("testkey");

		expect(result).toEqual(ACCOUNT_INFO_PARSED);
	});
});

// ─── fetchAsns ────────────────────────────────────────────────────────────────

describe("fetchAsns", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns cached ASNs from KV without calling fetch", async () => {
		const kv = makeKv({ "2captcha:asns": JSON.stringify(ASNS_DATA) });
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchAsns("testkey", kv);

		expect(result).toEqual(ASNS_DATA);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("fetches from API on KV miss and writes to KV", async () => {
		const kv = makeKv();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(ASNS_API_RESPONSE),
			})
		);

		const result = await fetchAsns("testkey", kv);

		expect(result).toEqual(ASNS_DATA);
		const stored = JSON.parse(kv.store.get("2captcha:asns") ?? "null");
		expect(stored).toEqual(ASNS_DATA);
	});

	it("returns empty array when API call fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 503 })
		);

		const result = await fetchAsns("testkey");

		expect(result).toEqual([]);
	});

	it("returns empty array when API body status is not OK", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ status: "ERROR", data: [] }),
			})
		);

		const result = await fetchAsns("testkey");

		expect(result).toEqual([]);
	});
});

// ─── fetchBalance ────────────────────────────────────────────────────────────

describe("fetchBalance", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns cached balance from KV without calling fetch", async () => {
		const kv = makeKv({
			"2captcha:balance": JSON.stringify({ balance: 88.8 }),
		});
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchBalance("testkey", kv);

		expect(result).toBe(88.8);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("fetches balance on KV miss and writes to KV", async () => {
		const kv = makeKv();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(BALANCE_API_RESPONSE),
			})
		);

		const result = await fetchBalance("testkey", kv);

		expect(result).toBe(123.45);
		const stored = JSON.parse(kv.store.get("2captcha:balance") ?? "null");
		expect(stored).toEqual({ balance: 123.45 });
	});

	it("returns null when API fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 500 })
		);

		const result = await fetchBalance("testkey");

		expect(result).toBeNull();
	});
});

// ─── getProxy ─────────────────────────────────────────────────────────────────

describe("getProxy", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		invalidateProxyCache();
	});

	it("returns a proxy from KV cache without calling fetch", async () => {
		const kv = makeKv({
			"2captcha:proxy-list": JSON.stringify({
				proxies: [{ host: "10.0.0.1", port: 8080 }],
				egressIp: "99.88.77.66",
			}),
		});
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const result = await getProxy("testkey", kv);

		expect(result).toEqual({ host: "10.0.0.1", port: 8080 });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("fetches fresh proxy list when KV is empty", async () => {
		const kv = makeKv();
		mockProxyFetch();

		const result = await getProxy("testkey", kv);

		expect(result).not.toBeNull();
		expect([8080, 8081]).toContain(result?.port);
		// KV should now hold the proxy list
		const stored = JSON.parse(kv.store.get("2captcha:proxy-list") ?? "null");
		expect(stored?.proxies).toHaveLength(2);
		expect(stored?.egressIp).toBe("99.88.77.66");
	});

	it("returns a proxy from in-memory cache on subsequent calls (no KV)", async () => {
		mockProxyFetch();
		const fetchMock = vi.mocked(global.fetch);

		await getProxy("testkey"); // populates memCache
		const callsAfterFirst = fetchMock.mock.calls.length;

		const result2 = await getProxy("testkey"); // should hit memCache

		expect(result2).not.toBeNull();
		expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // no new fetches
	});

	it("returns null when 2Captcha returns 0 proxies", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if ((url as string).includes("ipify.org")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(EGRESS_IP_RESPONSE),
					});
				}
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ status: "OK", data: [] }),
				});
			})
		);

		const result = await getProxy("testkey");

		expect(result).toBeNull();
	});

	it("returns null when egress IP discovery fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 503 })
		);

		const result = await getProxy("testkey");

		expect(result).toBeNull();
	});

	it("returns null when discovered egress IP is IPv6-only", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if ((url as string).includes("ipify.org")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(IPV6_EGRESS_RESPONSE),
					});
				}
				if ((url as string).includes("/proxy?key=")) {
					return Promise.resolve({
						ok: true,
						json: () =>
							Promise.resolve({
								status: "OK",
								data: {
									username: "u",
									status: 1,
									total_flow: 100,
									use_flow: 1,
									ip_white: ["2a06:98c0:3600::103"],
								},
							}),
					});
				}
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(PROXY_LIST_RESPONSE),
				});
			})
		);

		const result = await getProxy("testkey");

		expect(result).toBeNull();
	});

	it("falls back to account whitelist IPv4 when egress is IPv6-only", async () => {
		const kv = makeKv();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if ((url as string).includes("ipify.org")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(IPV6_EGRESS_RESPONSE),
					});
				}
				if ((url as string).includes("/proxy?key=")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(ACCOUNT_API_RESPONSE),
					});
				}
				if ((url as string).includes("generate_white_list_connections")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(PROXY_LIST_RESPONSE),
					});
				}
				return Promise.resolve({ ok: false, status: 404 });
			})
		);

		const result = await getProxy("testkey", kv);

		expect(result).not.toBeNull();
		const fetchCalls = vi
			.mocked(global.fetch)
			.mock.calls.map(([url]) => String(url));
		expect(
			fetchCalls.some(
				(url) =>
					url.includes("generate_white_list_connections") &&
					url.includes("ip=1.2.3.4")
			)
		).toBe(true);
	});

	it("retries with account whitelist IPv4 when primary egress request gets HTTP 400", async () => {
		const kv = makeKv();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if ((url as string).includes("ipify.org")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(EGRESS_IP_RESPONSE),
					});
				}
				if ((url as string).includes("/proxy?key=")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(ACCOUNT_API_RESPONSE),
					});
				}
				if (
					(url as string).includes("generate_white_list_connections") &&
					(url as string).includes("ip=99.88.77.66")
				) {
					return Promise.resolve({
						ok: false,
						status: 400,
						text: () => Promise.resolve("ip is not whitelisted"),
					});
				}
				if (
					(url as string).includes("generate_white_list_connections") &&
					(url as string).includes("ip=1.2.3.4")
				) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(PROXY_LIST_RESPONSE),
					});
				}
				return Promise.resolve({ ok: false, status: 404 });
			})
		);

		const result = await getProxy("testkey", kv);

		expect(result).not.toBeNull();
		const generateCalls = vi
			.mocked(global.fetch)
			.mock.calls.map(([url]) => String(url))
			.filter((url) => url.includes("generate_white_list_connections"));
		expect(generateCalls.length).toBe(2);
		expect(generateCalls[0]).toContain("ip=99.88.77.66");
		expect(generateCalls[1]).toContain("ip=1.2.3.4");
	});

	it("returns a proxy chosen randomly from multiple entries", async () => {
		const kv = makeKv({
			"2captcha:proxy-list": JSON.stringify({
				proxies: [
					{ host: "10.0.0.1", port: 8080 },
					{ host: "10.0.0.2", port: 8081 },
					{ host: "10.0.0.3", port: 8082 },
				],
				egressIp: "99.88.77.66",
			}),
		});
		vi.stubGlobal("fetch", vi.fn());

		const results = new Set<string>();
		for (let i = 0; i < 30; i++) {
			const proxy = await getProxy("testkey", kv);
			if (proxy) {
				results.add(`${proxy.host}:${proxy.port}`);
			}
		}

		// With 30 draws from 3 entries, expect all 3 chosen at least once
		expect(results.size).toBeGreaterThan(1);
	});

	it("skips proxy resolution when cached balance is zero", async () => {
		const kv = makeKv({
			"2captcha:balance": JSON.stringify({ balance: 0 }),
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if ((url as string).includes("/proxy/balance?key=")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ status: "OK", balance: 0 }),
					});
				}
				return Promise.resolve({ ok: false, status: 404 });
			})
		);

		const result = await getProxy("testkey", kv);

		expect(result).toBeNull();
		const fetchCalls = vi
			.mocked(global.fetch)
			.mock.calls.map(([url]) => String(url));
		expect(fetchCalls.some((url) => url.includes("/proxy/balance?key="))).toBe(
			true
		);
		expect(
			fetchCalls.some((url) => url.includes("generate_white_list_connections"))
		).toBe(false);
	});

	it("recovers from stale cached zero balance when live balance is positive", async () => {
		const kv = makeKv({
			"2captcha:balance": JSON.stringify({ balance: 0 }),
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if ((url as string).includes("/proxy/balance?key=")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ status: "OK", balance: 7.236 }),
					});
				}
				if ((url as string).includes("ipify.org")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(EGRESS_IP_RESPONSE),
					});
				}
				if ((url as string).includes("generate_white_list_connections")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(PROXY_LIST_RESPONSE),
					});
				}
				return Promise.resolve({ ok: false, status: 404 });
			})
		);

		const result = await getProxy("testkey", kv);

		expect(result).not.toBeNull();
		const stored = JSON.parse(kv.store.get("2captcha:balance") ?? "null");
		expect(stored).toEqual({ balance: 7.236 });
	});

	it("skips proxy resolution when insufficient-flow marker exists in KV", async () => {
		const kv = makeKv({
			"2captcha:insufficient-flow": JSON.stringify({
				until: Date.now() + 60_000,
			}),
		});
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const result = await getProxy("testkey", kv);

		expect(result).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("skips proxy resolution during insufficient-flow cooldown without KV", async () => {
		await markProxyInsufficientFlow();
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const result = await getProxy("testkey");

		expect(result).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

// ─── invalidateProxyCache ─────────────────────────────────────────────────────

describe("invalidateProxyCache", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		invalidateProxyCache();
	});

	it("clears in-memory cache so next call goes to network", async () => {
		mockProxyFetch();
		await getProxy("testkey"); // warm the in-memory cache
		vi.unstubAllGlobals();

		invalidateProxyCache();

		// After invalidation, a new fetch call is needed (no KV, no memCache)
		const freshFetch = vi.fn().mockImplementation((url: string) => {
			if ((url as string).includes("ipify.org")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(EGRESS_IP_RESPONSE),
				});
			}
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve(PROXY_LIST_RESPONSE),
			});
		});
		vi.stubGlobal("fetch", freshFetch);

		await getProxy("testkey");

		expect(freshFetch).toHaveBeenCalled();
	});
});

// ─── evictFailedProxy ───────────────────────────────────────────────────────

describe("evictFailedProxy", () => {
	it("removes only failed proxy from KV cached list", async () => {
		const kv = makeKv({
			"2captcha:proxy-list": JSON.stringify({
				egressIp: "99.88.77.66",
				proxies: [
					{ host: "10.0.0.1", port: 8080 },
					{ host: "10.0.0.2", port: 8081 },
				],
			}),
		});

		await evictFailedProxy({ host: "10.0.0.1", port: 8080 }, kv);

		const stored = JSON.parse(kv.store.get("2captcha:proxy-list") ?? "null");
		expect(stored?.proxies).toEqual([{ host: "10.0.0.2", port: 8081 }]);
	});

	it("deletes KV key when failed proxy is the only cached entry", async () => {
		const kv = makeKv({
			"2captcha:proxy-list": JSON.stringify({
				egressIp: "99.88.77.66",
				proxies: [{ host: "10.0.0.1", port: 8080 }],
			}),
		});

		await evictFailedProxy({ host: "10.0.0.1", port: 8080 }, kv);

		expect(kv.store.has("2captcha:proxy-list")).toBe(false);
	});
});
