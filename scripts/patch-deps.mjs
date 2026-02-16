/**
 * postinstall script – patches two Set-Cookie header dedup bugs that break
 * Better Auth's impersonation (and any response with multiple Set-Cookie headers).
 *
 * Bug 1 – better-call toResponse: uses headers.set() which overwrites Set-Cookie.
 * Bug 2 – alchemy miniflare proxy: uses out.setHeader() which does the same.
 *
 * Run automatically via "postinstall" in root package.json.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const patches = [
	{
		name: "better-call/dist/to-response.mjs",
		file: resolve(root, "node_modules/better-call/dist/to-response.mjs"),
		replacements: [
			// Response branch
			{
				from: "data.headers.set(key, value);",
				to: 'if (key === "set-cookie") data.headers.append(key, value); else data.headers.set(key, value);',
			},
			// JSON response – data.headers iteration
			{
				from: "of new Headers(data.headers).entries()) headers$1.set(key, value);",
				to: 'of new Headers(data.headers).entries()) { if (key === "set-cookie") headers$1.append(key, value); else headers$1.set(key, value); }',
			},
			// JSON response – init.headers iteration
			{
				from: "of new Headers(init.headers).entries()) headers$1.set(key, value);",
				to: 'of new Headers(init.headers).entries()) { if (key === "set-cookie") headers$1.append(key, value); else headers$1.set(key, value); }',
			},
		],
	},
	{
		name: "better-call/dist/to-response.cjs",
		file: resolve(root, "node_modules/better-call/dist/to-response.cjs"),
		replacements: [
			{
				from: "data.headers.set(key, value);",
				to: 'if (key === "set-cookie") data.headers.append(key, value); else data.headers.set(key, value);',
			},
			{
				from: "of new Headers(data.headers).entries()) headers$1.set(key, value);",
				to: 'of new Headers(data.headers).entries()) { if (key === "set-cookie") headers$1.append(key, value); else headers$1.set(key, value); }',
			},
			{
				from: "of new Headers(init.headers).entries()) headers$1.set(key, value);",
				to: 'of new Headers(init.headers).entries()) { if (key === "set-cookie") headers$1.append(key, value); else headers$1.set(key, value); }',
			},
		],
	},
	{
		name: "alchemy miniflare-worker-proxy.js",
		file: resolve(
			root,
			"node_modules/alchemy/lib/cloudflare/miniflare/miniflare-worker-proxy.js"
		),
		replacements: [
			{
				from: `            out.setHeader(key, value);
        }
    });`,
				to: `            if (key === "set-cookie") {
                out.appendHeader(key, value);
            }
            else {
                out.setHeader(key, value);
            }
        }
    });`,
			},
		],
	},
];

let applied = 0;
let skipped = 0;

for (const patch of patches) {
	if (!existsSync(patch.file)) {
		console.log(`  skip  ${patch.name} (file not found)`);
		skipped++;
		continue;
	}

	let content = readFileSync(patch.file, "utf8");
	let changed = false;

	for (const { from, to } of patch.replacements) {
		if (content.includes(to)) {
			continue; // already patched
		}
		if (!content.includes(from)) {
			console.warn(`  warn  ${patch.name}: expected text not found, skipping`);
			continue;
		}
		content = content.replace(from, to);
		changed = true;
	}

	if (changed) {
		writeFileSync(patch.file, content);
		console.log(`  patch ${patch.name}`);
		applied++;
	} else {
		console.log(`  ok    ${patch.name} (already patched)`);
		skipped++;
	}
}

console.log(`\npostinstall patches: ${applied} applied, ${skipped} skipped`);
