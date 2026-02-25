/**
 * Integration smoke-test for the 2Captcha proxy client.
 * Runs in Bun (or Node) against the real 2Captcha API.
 *
 * Prerequisites:
 *   TWO_CAPTCHA_API_KEY=<your-key>  (read from .env automatically via bunfig)
 *
 * Usage:
 *   bun scripts/debug-proxy.ts
 *
 * Note: fetchViaProxy (cloudflare:sockets CONNECT tunnel) can only be tested
 * inside a deployed Cloudflare Worker. Use `wrangler tail` to observe proxy
 * usage when the first ingest request fires.
 */

import {
	fetchAccountInfo,
	fetchAsns,
	fetchBalance,
	generateWhitelistConnections,
} from "../packages/youtube/src/proxy-client";

// ─── Config ──────────────────────────────────────────────────────────────────

const apiKey = process.env.TWO_CAPTCHA_API_KEY;
if (!apiKey) {
	console.error("TWO_CAPTCHA_API_KEY is not set. Export it before running.");
	process.exit(1);
}

console.log("2Captcha proxy client — integration smoke-test");
console.log("=".repeat(50));

// ─── 1. Account info ─────────────────────────────────────────────────────────

process.stdout.write("\n[1/5] Fetching account info … ");
const account = await fetchAccountInfo(apiKey);
if (account) {
	console.log("OK");
	console.log("  username     :", account.username);
	console.log("  status       :", account.status);
	console.log(
		"  flow used    :",
		`${account.useFlow} / ${account.totalFlow} MB`
	);
	console.log("  last flow    :", account.lastFlow ?? "n/a");
	console.log(
		"  whitelisted  :",
		account.whitelistedIps.length > 0
			? account.whitelistedIps.join(", ")
			: "(none — add your egress IP below to the 2Captcha dashboard)"
	);
} else {
	console.log("FAILED (null returned — check API key)");
}

process.stdout.write("[1b/5] Fetching balance … ");
const balance = await fetchBalance(apiKey);
if (balance === null) {
	console.log("FAILED (null returned — check API key)");
} else {
	console.log(`OK (${balance})`);
}

// ─── 2. ASNs ──────────────────────────────────────────────────────────────────

process.stdout.write("\n[2/5] Fetching ASN list … ");
const asns = await fetchAsns(apiKey);
if (asns.length === 0) {
	console.log("FAILED (empty — check API key or quota)");
} else {
	console.log(`OK (${asns.length} ASNs)`);
	for (const asn of asns.slice(0, 5)) {
		console.log(`  ${asn.code.padEnd(12)} ${asn.countryCode}  ${asn.title}`);
	}
	if (asns.length > 5) {
		console.log(`  … and ${asns.length - 5} more`);
	}
}

// ─── 3. Egress IP ─────────────────────────────────────────────────────────────

process.stdout.write("\n[3/5] Discovering egress IP … ");
const egressRes = await fetch("https://api.ipify.org?format=json");
const egressData = (await egressRes.json()) as { ip?: string };
const egressIp = egressData?.ip ?? "";
if (!egressIp) {
	console.log("FAILED (could not reach ipify.org)");
	process.exit(1);
}
console.log(egressIp);

const isWhitelisted = account?.whitelistedIps.includes(egressIp) ?? false;
if (!isWhitelisted) {
	console.log(`
  This IP is NOT yet in your 2Captcha whitelist.
  To register it:
    1. Open https://portal.2captcha.com/proxy (Proxy → IP Whitelist)
    2. Add: ${egressIp}
    3. Re-run this script.
`);
}

// ─── 4. Generate whitelist connections ────────────────────────────────────────

process.stdout.write("[4/5] Calling generate_white_list_connections … ");
let proxies: Awaited<ReturnType<typeof generateWhitelistConnections>> = [];
try {
	proxies = await generateWhitelistConnections(apiKey, egressIp, {
		count: 10,
	});
} catch (e) {
	console.log(`FAILED (${(e as Error).message})`);
}

if (proxies.length > 0) {
	console.log(`OK (${proxies.length} proxies returned)`);
	for (const p of proxies) {
		console.log(`  ${p.host}:${p.port}`);
	}
} else if (isWhitelisted) {
	console.log("WARNING: IP is whitelisted but 0 proxies returned.");
	console.log("  This may mean the account has no remaining traffic quota.");
} else {
	console.log(
		"0 proxies — expected (IP not whitelisted yet, see step 3 above)."
	);
}
// ─── 5. YouTube InnerTube request via proxy ─────────────────────────────────

// ─── 5. Verify proxy + YouTube InnerTube via proxy ───────────────────────────
// The http-protocol proxies from step 4 are for the CF Worker (cloudflare:sockets
// CONNECT tunneling). For a local Bun test we generate a small socks5 batch,
// which Bun's native fetch() supports end-to-end.

const TEST_VIDEO_ID = "dQw4w9WgXcQ"; // well-known public video

// ─── 5. Direct YouTube InnerTube sanity check ────────────────────────────────
// Confirms the InnerTube client config and network access are working.
// The deployed CF Worker routes these same requests through the http proxies
// from step 4 via cloudflare:sockets (proxy-fetch.ts).

process.stdout.write("\n[5/5] Direct YouTube InnerTube check … ");
try {
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), 15_000);
	const playerBody = JSON.stringify({
		videoId: TEST_VIDEO_ID,
		context: {
			client: {
				clientName: "ANDROID_VR",
				clientVersion: "1.71.26",
				deviceMake: "Oculus",
				deviceModel: "Quest 3",
				androidSdkVersion: 32,
				osName: "Android",
				osVersion: "12L",
				hl: "en",
				gl: "US",
			},
		},
	});
	const ytRes = await fetch(
		"https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
		{
			method: "POST",
			signal: ac.signal,
			headers: {
				"Content-Type": "application/json",
				"User-Agent":
					"com.google.android.apps.youtube.vr.oculus/1.71.26 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
				"X-YouTube-Client-Name": "28",
				"X-YouTube-Client-Version": "1.71.26",
			},
			body: playerBody,
		}
	);
	clearTimeout(timer);
	const ytData = (await ytRes.json()) as Record<string, unknown>;
	interface CaptionTrack {
		kind?: string;
		languageCode: string;
	}
	const capTracks =
		((
			(ytData.captions as Record<string, unknown>)
				?.playerCaptionsTracklistRenderer as Record<string, unknown>
		)?.captionTracks as CaptionTrack[]) ?? [];
	const audioFmts =
		(
			(ytData.streamingData as Record<string, unknown>)?.adaptiveFormats as {
				mimeType?: string;
			}[]
		)?.filter((f) => f.mimeType?.startsWith("audio/")) ?? [];
	const playStatus =
		((ytData.playabilityStatus as Record<string, unknown>)?.status as string) ??
		"unknown";
	console.log(`HTTP ${ytRes.status} | playability=${playStatus}`);
	console.log(
		`  captions: ${capTracks.length} track(s)  audio formats: ${audioFmts.length}`
	);
	for (const t of capTracks.slice(0, 5)) {
		console.log(`  lang=${t.languageCode} kind=${t.kind ?? "manual"}`);
	}
	if (playStatus === "OK") {
		console.log(
			"  InnerTube API is reachable. CF Worker will route this via the proxy list."
		);
	}
} catch (e) {
	const msg = (e as Error).message;
	const isTimeout = msg.includes("aborted") || msg.includes("timed out");
	console.log(isTimeout ? "timed out" : `FAILED (${msg})`);
}
// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
const allOk = account !== null && asns.length > 0 && proxies.length > 0;
if (allOk) {
	console.log("All checks passed. Proxy client is ready to deploy.");
	console.log(
		"Deploy the Worker and watch logs to confirm fetchViaProxy routing."
	);
} else if (isWhitelisted) {
	console.log("Some checks failed — see output above for details.");
	process.exit(1);
} else {
	console.log(
		`Next step: add ${egressIp} to https://portal.2captcha.com/proxy then re-run.`
	);
}
