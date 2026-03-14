/**
 * Adds declaration boundaries to all library packages:
 * - Adds "types" export condition pointing to dist/*.d.ts
 * - Adds "build-types" script: tsc --emitDeclarationOnly
 *
 * Run once, then delete.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

// These packages don't participate in the TS type-check pipeline
const SKIP = new Set([
	"config", // tsconfig-only, no exports
	"tailwind-config", // CSS only
	"e2e-web", // playwright, no exports
	"vitest-config", // already has dist build
	"ai-chat", // Svelte, uses svelte-check
	"ui", // Svelte, uses svelte-check
]);

/**
 * Transform a source path to its declaration path.
 * ./src/foo/bar.ts  →  ./dist/foo/bar.d.ts
 * ./src/foo/*.ts    →  ./dist/foo/*.d.ts
 */
const toDeclarationPath = (srcPath) =>
	srcPath.replace(/^\.\/src\//, "./dist/").replace(/\.ts$/, ".d.ts");

/**
 * Add "types" condition to a single export value.
 * Handles string shorthand and object form.
 * Skips if types already points to dist/.
 */
const addTypes = (value) => {
	if (typeof value === "string") {
		if (!value.endsWith(".ts")) return value; // CSS etc — skip
		return { types: toDeclarationPath(value), default: value };
	}

	if (typeof value === "object" && value !== null) {
		// Already points to dist — leave alone
		if (value.types && !value.types.includes("/src/")) return value;

		const srcPath = value.default ?? value.types;
		if (!srcPath || !srcPath.endsWith(".ts")) return value;

		const typesPath = toDeclarationPath(srcPath);
		// Preserve existing key order, insert types first
		return { types: typesPath, ...value };
	}

	return value;
};

const packages = readdirSync(join(root, "packages"), { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

let updated = 0;

for (const pkgName of packages) {
	if (SKIP.has(pkgName)) {
		console.log(`  skip  ${pkgName}`);
		continue;
	}

	const pkgPath = join(root, "packages", pkgName, "package.json");
	const tsconfigPath = join(root, "packages", pkgName, "tsconfig.json");

	if (!existsSync(pkgPath)) continue;

	const raw = readFileSync(pkgPath, "utf-8");
	const pkg = JSON.parse(raw);

	// Must have exports to be a library package
	if (!pkg.exports) {
		console.log(`  skip  ${pkgName} (no exports)`);
		continue;
	}

	// Must have a TS check-types script (skips svelte-check packages etc.)
	const checkTypes = pkg.scripts?.["check-types"];
	if (!checkTypes || checkTypes.includes("svelte-check")) {
		console.log(`  skip  ${pkgName} (no tsc check-types)`);
		continue;
	}

	// Must have a tsconfig to emit from
	if (!existsSync(tsconfigPath)) {
		console.log(`  skip  ${pkgName} (no tsconfig)`);
		continue;
	}

	// --- Transform exports ---
	const newExports = {};
	for (const [key, value] of Object.entries(pkg.exports)) {
		newExports[key] = addTypes(value);
	}
	pkg.exports = newExports;

	// --- Add build-types script (insert before check-types) ---
	if (!pkg.scripts["build-types"]) {
		const scripts = {};
		for (const [k, v] of Object.entries(pkg.scripts)) {
			if (k === "check-types") {
				scripts["build-types"] = "tsc --emitDeclarationOnly -p tsconfig.json";
			}
			scripts[k] = v;
		}
		pkg.scripts = scripts;
	}

	// Detect indentation from original file (tabs vs spaces)
	const indent = raw.startsWith("{\n\t") ? "\t" : 2;
	writeFileSync(pkgPath, JSON.stringify(pkg, null, indent) + "\n");
	console.log(`  done  ${pkgName}`);
	updated++;
}

console.log(`\nUpdated ${updated} packages.`);
