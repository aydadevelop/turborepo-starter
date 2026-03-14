import { readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const IGNORE_DIRS = new Set([
	".git",
	".turbo",
	"node_modules",
	"dist",
	"build",
	"coverage",
	".svelte-kit",
	"legacy", // exclude archived code
]);

const walkTsconfigs = (startDir) => {
	const queue = [startDir];
	const configs = [];
	while (queue.length > 0) {
		const current = queue.pop();
		if (!current) continue;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!IGNORE_DIRS.has(entry.name))
					queue.push(path.join(current, entry.name));
			} else if (entry.isFile() && entry.name === "tsconfig.json") {
				configs.push(path.join(current, entry.name));
			}
		}
	}
	return configs;
};

const normalize = (f) => {
	try {
		return realpathSync.native(f).split(path.sep).join("/");
	} catch {
		return path.resolve(f).split(path.sep).join("/");
	}
};

const isWs = (f) => {
	const n = normalize(f);
	const r = normalize(root);
	return (
		n.startsWith(r) &&
		!n.includes("/node_modules/") &&
		!n.includes("/.svelte-kit/") &&
		!n.includes("/dist/") &&
		!n.includes("/legacy/")
	);
};

const configs = walkTsconfigs(root);
let totalM = 0;
const unique = new Set();

for (const c of configs) {
	const r = ts.readConfigFile(c, ts.sys.readFile);
	if (r.error) continue;
	const p = ts.parseJsonConfigFileContent(
		r.config,
		ts.sys,
		path.dirname(c),
		undefined,
		c,
	);
	const host = ts.createCompilerHost(p.options, true);
	const prog = ts.createProgram({
		rootNames: p.fileNames,
		options: p.options,
		host,
	});
	const files = prog.getSourceFiles().map((f) => f.fileName).filter(isWs);
	for (const f of files) unique.add(normalize(f));
	totalM += files.length;
}

const u = unique.size;
console.log("Active workspace (excluding legacy/):");
console.log("  Projects analyzed:", configs.length);
console.log("  Unique source files:", u);
console.log("  Total memberships:", totalM);
console.log("  Overlap multiplier:", (totalM / u).toFixed(2) + "x");
