/**
 * Unit tests for proxy-fetch.ts.
 *
 * `cloudflare:sockets` is mocked via vi.mock (hoisted by Vitest before
 * any imports run). Each test configures what `connect()` returns via a
 * lightweight ReadableStream / WritableStream pair that replays canned
 * CONNECT and HTTP responses.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted ensures mockConnect is defined before the vi.mock factory runs
const mockConnect = vi.hoisted(() => vi.fn());

vi.mock("cloudflare:sockets", () => ({
	connect: mockConnect,
}));

const { fetchViaProxy } = await import("../proxy-fetch");

// ─── Socket helpers ───────────────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

function makeReadable(data: string): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(ctrl) {
			ctrl.enqueue(enc.encode(data));
			ctrl.close();
		},
	});
}

interface WritableSink {
	writable: WritableStream<Uint8Array>;
	written(): string;
}

function makeWritable(): WritableSink {
	const chunks: Uint8Array[] = [];
	const writable = new WritableStream<Uint8Array>({
		write(chunk) {
			chunks.push(chunk);
		},
	});
	return { writable, written: () => chunks.map((c) => dec.decode(c)).join("") };
}

interface MockSocket {
	close: () => Promise<void>;
	readable: ReadableStream<Uint8Array>;
	startTls: (opts?: unknown) => MockTlsSocket;
	writable: WritableStream<Uint8Array>;
}

interface MockTlsSocket {
	_sink: WritableSink;
	close: () => Promise<void>;
	readable: ReadableStream<Uint8Array>;
	writable: WritableStream<Uint8Array>;
}

/**
 * Build a mock raw proxy socket.
 *
 * - `connectResponse`: bytes the proxy sends back after CONNECT (e.g. "HTTP/1.1 200 …\r\n\r\n")
 * - `tlsResponse`:     bytes the origin server sends over the TLS tunnel
 */
function makeSocket(connectResponse: string, tlsResponse: string): MockSocket {
	const tlsSink = makeWritable();
	const tlsSocket: MockTlsSocket = {
		readable: makeReadable(tlsResponse),
		writable: tlsSink.writable,
		close: () => Promise.resolve(),
		_sink: tlsSink,
	};

	return {
		readable: makeReadable(connectResponse),
		writable: makeWritable().writable,
		startTls: (_opts?: unknown) => tlsSocket,
		close: () => Promise.resolve(),
	};
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const PROXY = { host: "proxy.test", port: 8080 };

describe("fetchViaProxy", () => {
	beforeEach(() => {
		mockConnect.mockReset();
	});

	it("opens TCP to proxy host and port", async () => {
		const socket = makeSocket(
			"HTTP/1.1 200 Connection established\r\n\r\n",
			"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n"
		);
		mockConnect.mockReturnValue(socket);

		await fetchViaProxy("https://example.com/", PROXY);

		expect(mockConnect).toHaveBeenCalledWith({
			hostname: "proxy.test",
			port: 8080,
		});
	});

	it("returns Response with correct status and body", async () => {
		const socket = makeSocket(
			"HTTP/1.1 200 Connection established\r\n\r\n",
			"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nHello"
		);
		mockConnect.mockReturnValue(socket);

		const res = await fetchViaProxy("https://example.com/api", PROXY);

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("Hello");
	});

	it("preserves non-200 HTTP status from origin", async () => {
		const socket = makeSocket(
			"HTTP/1.1 200 Connection established\r\n\r\n",
			"HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nNot found"
		);
		mockConnect.mockReturnValue(socket);

		const res = await fetchViaProxy("https://example.com/missing", PROXY);

		expect(res.status).toBe(404);
	});

	it("throws when the proxy rejects CONNECT with a non-200 status", async () => {
		const socket = makeSocket(
			"HTTP/1.1 407 Proxy Authentication Required\r\n\r\n",
			""
		);
		mockConnect.mockReturnValue(socket);

		await expect(fetchViaProxy("https://example.com/", PROXY)).rejects.toThrow(
			"[proxy] CONNECT failed"
		);
	});

	it("sends the correct CONNECT request line and Host header", async () => {
		const proxySink = makeWritable();
		const tlsSocket: MockTlsSocket = {
			readable: makeReadable("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n"),
			writable: makeWritable().writable,
			close: () => Promise.resolve(),
			_sink: makeWritable(),
		};
		const socket: MockSocket = {
			readable: makeReadable("HTTP/1.1 200 Connection established\r\n\r\n"),
			writable: proxySink.writable,
			startTls: () => tlsSocket,
			close: () => Promise.resolve(),
		};
		mockConnect.mockReturnValue(socket);

		await fetchViaProxy("https://api.example.com/v1/data", PROXY);

		const written = proxySink.written();
		expect(written).toContain("CONNECT api.example.com:443 HTTP/1.1");
		expect(written).toContain("Host: api.example.com:443");
	});

	it("sends GET request with Host header through TLS tunnel", async () => {
		const tlsSink = makeWritable();
		const tlsSocket: MockTlsSocket = {
			readable: makeReadable("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n"),
			writable: tlsSink.writable,
			close: () => Promise.resolve(),
			_sink: tlsSink,
		};
		const socket: MockSocket = {
			readable: makeReadable("HTTP/1.1 200 Connection established\r\n\r\n"),
			writable: makeWritable().writable,
			startTls: () => tlsSocket,
			close: () => Promise.resolve(),
		};
		mockConnect.mockReturnValue(socket);

		await fetchViaProxy("https://api.example.com/path?q=1", PROXY, {
			method: "GET",
			headers: { "X-Custom": "header" },
		});

		const written = tlsSink.written();
		expect(written).toContain("GET /path?q=1 HTTP/1.1");
		expect(written).toContain("host: api.example.com");
		expect(written).toContain("x-custom: header");
	});

	it("sends POST body through TLS tunnel with Content-Length", async () => {
		const tlsSink = makeWritable();
		const tlsSocket: MockTlsSocket = {
			readable: makeReadable(
				"HTTP/1.1 201 Created\r\nContent-Length: 0\r\n\r\n"
			),
			writable: tlsSink.writable,
			close: () => Promise.resolve(),
			_sink: tlsSink,
		};
		const socket: MockSocket = {
			readable: makeReadable("HTTP/1.1 200 Connection established\r\n\r\n"),
			writable: makeWritable().writable,
			startTls: () => tlsSocket,
			close: () => Promise.resolve(),
		};
		mockConnect.mockReturnValue(socket);

		const res = await fetchViaProxy("https://api.example.com/submit", PROXY, {
			method: "POST",
			body: "payload",
		});

		expect(res.status).toBe(201);
		const written = tlsSink.written();
		expect(written).toContain("POST /submit HTTP/1.1");
		expect(written).toContain("content-length: 7");
		expect(written).toContain("payload");
	});
});
