/**
 * HTTP CONNECT proxy tunnel for Cloudflare Workers.
 *
 * Uses `cloudflare:sockets` to open a raw TCP connection to the proxy,
 * perform the HTTP CONNECT handshake, upgrade to TLS, then issue the real
 * HTTPS request through the tunnel and return a standard `Response`.
 *
 * This is the only supported way to route HTTPS traffic through a proxy in
 * a Cloudflare Worker — native `fetch` has no proxy option.
 */

// @ts-expect-error — cloudflare:sockets is a CF runtime module, not in @types
import { connect } from "cloudflare:sockets";
import type { ProxyEntry } from "./proxy-client";

// ─── Utilities ────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();
const HEADER_SEP = enc.encode("\r\n\r\n");
const STATUS_RE = /^HTTP\/[\d.]+ (\d+)/;

function concat(
	a: Uint8Array<ArrayBufferLike>,
	b: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBufferLike> {
	const out = new Uint8Array(a.length + b.length);
	out.set(a);
	out.set(b, a.length);
	return out;
}

function defaultPort(protocol: string): number {
	return protocol === "https:" ? 443 : 80;
}

function indexOfBytes(
	haystack: Uint8Array<ArrayBufferLike>,
	needle: Uint8Array<ArrayBufferLike>
): number {
	outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i + j] !== needle[j]) {
				continue outer;
			}
		}
		return i;
	}
	return -1;
}

// ─── Stream helpers ───────────────────────────────────────────────────────────

/**
 * Read from a stream until `\r\n\r\n` appears.
 * Returns the header string and any bytes read beyond the separator.
 */
async function readHttpHeaders(
	reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<{ headerText: string; leftover: Uint8Array<ArrayBufferLike> }> {
	let buf: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		buf = concat(buf, value);
		const idx = indexOfBytes(buf, HEADER_SEP);
		if (idx !== -1) {
			return {
				headerText: dec.decode(buf.slice(0, idx)),
				leftover: buf.slice(idx + 4),
			};
		}
	}

	return { headerText: dec.decode(buf), leftover: new Uint8Array(0) };
}

/** Read the full body, respecting Content-Length if present. */
async function readHttpBody(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	headers: Headers,
	leftover: Uint8Array<ArrayBufferLike>
): Promise<Uint8Array<ArrayBufferLike>> {
	const cl = headers.get("content-length");
	if (cl !== null) {
		const total = Number.parseInt(cl, 10);
		let buf: Uint8Array<ArrayBufferLike> = leftover;
		while (buf.length < total) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			buf = concat(buf, value);
		}
		return buf.slice(0, total);
	}

	// Read-to-close fallback
	let buf: Uint8Array<ArrayBufferLike> = leftover;
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		buf = concat(buf, value);
	}
	return buf;
}

function parseHeaders(headerText: string): {
	statusLine: string;
	headers: Headers;
} {
	const lines = headerText.split("\r\n");
	const statusLine = lines[0] ?? "";
	const headers = new Headers();
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (!line) {
			continue;
		}
		const colon = line.indexOf(":");
		if (colon > 0) {
			headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
		}
	}
	return { statusLine, headers };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a URL through an HTTP CONNECT proxy.
 *
 * Flow:
 *  1. TCP connect to proxy host:port
 *  2. Send `CONNECT target:443 HTTP/1.1` → assert 200
 *  3. Upgrade the TCP socket to TLS via `socket.startTls()`
 *  4. Write the real HTTP/1.1 request over the TLS tunnel
 *  5. Parse the HTTP response and return a `Response`
 */
export async function fetchViaProxy(
	url: string,
	proxy: ProxyEntry,
	init?: RequestInit
): Promise<Response> {
	const target = new URL(url);
	const targetHost = target.hostname;
	const targetPort = target.port
		? Number(target.port)
		: defaultPort(target.protocol);

	// ── 1. Open raw TCP to proxy ─────────────────────────────────────────────
	const proxySocket: {
		readable: ReadableStream<Uint8Array>;
		writable: WritableStream<Uint8Array>;
		startTls: (opts?: {
			expectedServerHostname?: string;
		}) => typeof proxySocket;
		close: () => Promise<void>;
	} = connect({ hostname: proxy.host, port: proxy.port });

	const proxyWriter = proxySocket.writable.getWriter();
	await proxyWriter.write(
		enc.encode(
			`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`
		)
	);
	proxyWriter.releaseLock();

	// ── 2. Parse CONNECT response ────────────────────────────────────────────
	const proxyReader = proxySocket.readable.getReader();
	const { headerText: connectHeader } = await readHttpHeaders(proxyReader);
	proxyReader.releaseLock();

	if (!connectHeader.includes(" 200")) {
		await proxySocket.close();
		const statusLine = connectHeader.split("\r\n")[0] ?? "";
		const detail =
			statusLine ||
			"(empty response — proxy may be unreachable or connection was reset)";
		throw new Error(`[proxy] CONNECT failed: ${detail}`);
	}

	// ── 3. Upgrade to TLS ─────────────────────────────────────────────────────
	const tlsSocket = proxySocket.startTls({
		expectedServerHostname: targetHost,
	});

	// ── 4. Send HTTP/1.1 request ─────────────────────────────────────────────
	const method = (init?.method ?? "GET").toUpperCase();
	const path = `${target.pathname}${target.search}`;
	const reqHeaders = new Headers(init?.headers ?? {});
	reqHeaders.set("Host", targetHost);
	reqHeaders.set("Connection", "close");

	let bodyBytes: Uint8Array | undefined;
	if (init?.body !== undefined && init.body !== null) {
		if (typeof init.body === "string") {
			bodyBytes = enc.encode(init.body);
		} else if (init.body instanceof Uint8Array) {
			bodyBytes = init.body;
		}
		if (bodyBytes) {
			reqHeaders.set("Content-Length", String(bodyBytes.length));
		}
	}

	const requestLines: string[] = [`${method} ${path} HTTP/1.1`];
	reqHeaders.forEach((value, key) => {
		requestLines.push(`${key}: ${value}`);
	});
	requestLines.push("", "");

	const tlsWriter = tlsSocket.writable.getWriter();
	await tlsWriter.write(enc.encode(requestLines.join("\r\n")));
	if (bodyBytes) {
		await tlsWriter.write(bodyBytes);
	}
	tlsWriter.releaseLock();

	// ── 5. Parse HTTP response ───────────────────────────────────────────────
	const tlsReader = tlsSocket.readable.getReader();
	const { headerText, leftover } = await readHttpHeaders(tlsReader);
	const { statusLine, headers } = parseHeaders(headerText);

	const statusMatch = STATUS_RE.exec(statusLine);
	const status = statusMatch?.[1] ? Number.parseInt(statusMatch[1], 10) : 200;

	const body = await readHttpBody(tlsReader, headers, leftover);
	tlsReader.releaseLock();

	return new Response(body.buffer as ArrayBuffer, { status, headers });
}
