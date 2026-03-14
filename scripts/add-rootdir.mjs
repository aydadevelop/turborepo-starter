import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TARGETS = [
	"api",
	"api-contract",
	"assistant",
	"auth",
	"booking",
	"calendar",
	"catalog",
	"db",
	"env",
	"events",
	"notifications",
	"organization",
	"payment",
	"pricing",
	"promotions",
	"proxy",
	"reference-data",
	"storage",
	"support",
	"telemetry",
	"workflows",
];

for (const name of TARGETS) {
	const p = join("packages", name, "tsconfig.json");
	if (!existsSync(p)) {
		console.log("missing", name);
		continue;
	}
	const raw = readFileSync(p, "utf-8");
	const cfg = JSON.parse(raw);
	const co = cfg.compilerOptions ?? {};
	if (co.rootDir) {
		console.log("already has rootDir", name, co.rootDir);
		continue;
	}
	co.rootDir = "src";
	cfg.compilerOptions = co;
	const indent = raw.startsWith("{\n\t") ? "\t" : 2;
	writeFileSync(p, JSON.stringify(cfg, null, indent) + "\n");
	console.log("patched", name);
}
