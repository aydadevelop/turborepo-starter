import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");
const clientManifestPath = path.resolve(
	webDir,
	".svelte-kit/output/client/.vite/manifest.json"
);
const routeDictionaryPath = path.resolve(
	webDir,
	".svelte-kit/generated/client-optimized/app.js"
);
const clientOutputDir = path.resolve(webDir, ".svelte-kit/output/client");

const BASE_NODE_INDEXES = [0, 1];
const MAX_ROUTE_GZIP_KB = Number(process.env.PAGE_MAX_GZIP_KB ?? 360);

const toKb = (bytes) => (bytes / 1024).toFixed(2);

if (!existsSync(clientManifestPath) || !existsSync(routeDictionaryPath)) {
	console.error(
		"Per-page size check requires an existing build output. Run `bun run build` first."
	);
	process.exit(1);
}

const clientManifest = JSON.parse(readFileSync(clientManifestPath, "utf-8"));
const appSource = readFileSync(routeDictionaryPath, "utf-8");
const dictionaryMatch = appSource.match(/export const dictionary = (\{[\s\S]*?\});/);
if (!dictionaryMatch) {
	console.error("Failed to read route dictionary from generated app.js.");
	process.exit(1);
}

const dictionary = new Function(
	`"use strict"; return (${dictionaryMatch[1]});`
)();

const visited = new Set();
const collectEntryFiles = (entryKey, files) => {
	if (!entryKey || visited.has(entryKey)) {
		return;
	}
	visited.add(entryKey);

	const entry = clientManifest[entryKey];
	if (!entry) {
		return;
	}

	if (typeof entry.file === "string") {
		files.add(entry.file);
	}
	for (const css of entry.css ?? []) {
		files.add(css);
	}

	for (const imported of entry.imports ?? []) {
		collectEntryFiles(imported, files);
	}
};

const routeRows = [];

for (const [route, value] of Object.entries(dictionary)) {
	const leafNode = Array.isArray(value) ? value[0] : null;
	const layoutNodes =
		Array.isArray(value) && Array.isArray(value[1]) ? value[1] : [];
	if (typeof leafNode !== "number") {
		continue;
	}

	const nodeIndexes = [...new Set([...BASE_NODE_INDEXES, ...layoutNodes, leafNode])];
	const routeFiles = new Set();
	visited.clear();

	for (const nodeIndex of nodeIndexes) {
		const key = `.svelte-kit/generated/client-optimized/nodes/${nodeIndex}.js`;
		collectEntryFiles(key, routeFiles);
	}

	let gzipBytes = 0;
	for (const relativeFile of routeFiles) {
		const absoluteFile = path.resolve(clientOutputDir, relativeFile);
		if (!existsSync(absoluteFile)) {
			continue;
		}
		const content = readFileSync(absoluteFile);
		gzipBytes += gzipSync(content, { level: 9 }).length;
	}

	routeRows.push({
		route,
		gzipBytes,
		files: routeFiles.size,
	});
}

routeRows.sort((a, b) => b.gzipBytes - a.gzipBytes);

console.log(`\nPer-page gzip budgets (max ${MAX_ROUTE_GZIP_KB} KiB):`);
for (const row of routeRows) {
	console.log(
		`- ${row.route.padEnd(28, " ")} ${toKb(row.gzipBytes)} KiB (${row.files} files)`
	);
}

const offenders = routeRows.filter((row) => row.gzipBytes / 1024 > MAX_ROUTE_GZIP_KB);
if (offenders.length > 0) {
	console.error("\nPer-page size budget check failed:");
	for (const row of offenders) {
		console.error(
			`- ${row.route}: ${toKb(row.gzipBytes)} KiB exceeds ${MAX_ROUTE_GZIP_KB} KiB`
		);
	}
	process.exit(1);
}

console.log("\nPer-page size budget check passed.");
