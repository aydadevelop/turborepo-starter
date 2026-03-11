import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbSrcDir = path.resolve(__dirname, "..");
const relationsFile = path.join(dbSrcDir, "relations.ts");
const relationsDir = path.join(dbSrcDir, "relations");

describe("Relations governance", () => {
	it("keeps relations.ts as a stable merger over bounded-context fragments", () => {
		const relationsText = readFileSync(relationsFile, "utf8");

		expect(relationsText).toContain("const baseRelations = defineRelations(schema);");
		expect(relationsText).toContain('import { authRelations } from "./relations/auth";');
		expect(relationsText).toContain(
			'import { marketplaceRelations } from "./relations/marketplace";',
		);
		expect(relationsText).toContain(
			'import { supportRelations } from "./relations/support";',
		);
		expect(relationsText).not.toContain("user: {");
		expect(relationsText).not.toContain("booking: {");
	});

	it("ships the bounded-context relation fragment directory", () => {
		expect(existsSync(relationsDir)).toBe(true);

		const fragmentFiles = readdirSync(relationsDir).sort();

		expect(fragmentFiles).toEqual([
			"affiliate.ts",
			"auth.ts",
			"availability.ts",
			"marketplace.ts",
			"notification.ts",
			"staffing.ts",
			"support.ts",
			"system.ts",
		]);
	});
});
