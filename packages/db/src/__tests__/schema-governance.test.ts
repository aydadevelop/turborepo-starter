import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.resolve(__dirname, "../schema");

const collectSchemaFiles = (dir: string): string[] => {
	const files: string[] = [];

	for (const entry of readdirSync(dir)) {
		const fullPath = path.join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			files.push(...collectSchemaFiles(fullPath));
			continue;
		}
		if (entry.endsWith(".ts")) {
			files.push(fullPath);
		}
	}

	return files.sort();
};

const schemaFiles = collectSchemaFiles(schemaDir);
const schemaContents = schemaFiles.map((filePath) => ({
	filePath,
	content: readFileSync(filePath, "utf8"),
}));
const allSchemaText = schemaContents.map((entry) => entry.content).join("\n");

describe("Schema governance", () => {
	it("keeps marketplace.ts as a stable barrel over bounded-context modules", () => {
		const marketplaceBarrel = readFileSync(
			path.join(schemaDir, "marketplace.ts"),
			"utf8",
		);

		expect(marketplaceBarrel).toContain('export * from "./marketplace/shared";');
		expect(marketplaceBarrel).toContain(
			'export * from "./marketplace/bookings";',
		);
		expect(marketplaceBarrel).not.toContain("pgTable(");
	});

	it("pins current legacy serial usage to todo only", () => {
		const serialFiles = schemaContents
			.filter(({ content }) => content.includes("serial("))
			.map(({ filePath }) => path.relative(schemaDir, filePath));

		expect(serialFiles).toEqual(["todo.ts"]);
	});

	it("pins current JSONB scalar-array debt to the known migration targets", () => {
		const scalarArrayTargets = [
			'defaultAmenityKeys: jsonb("default_amenity_keys")',
			'requiredFields: jsonb("required_fields")',
			'supportedPricingModels: jsonb("supported_pricing_models")',
			'supportedCurrencies: jsonb("supported_currencies")',
			'daysOfWeek: jsonb("days_of_week")',
		];

		for (const target of scalarArrayTargets) {
			expect(allSchemaText).toContain(target);
		}

		expect(allSchemaText).toContain('requiredFields: jsonb("required_fields")');

		const jsonbScalarArrayTypeMatches = [
			...allSchemaText.matchAll(/\.\$type<(string|number)\[\]>\(\)/g),
		];

		expect(jsonbScalarArrayTypeMatches).toHaveLength(5);
	});

	it("keeps ADR-010 hot-path index additions present in schema definitions", () => {
		const requiredIndexNames = [
			"workflow_step_log_ix_execution_id",
			"organization_payment_config_ix_provider_config_id",
			"listing_publication_ix_merchant_payment_config_id",
			"listing_publication_ix_pricing_profile_id",
			"booking_ix_publication_id",
			"booking_ix_merchant_organization_id",
			"booking_ix_merchant_payment_config_id",
			"listing_availability_block_ix_calendar_connection_id",
			"support_ticket_message_ix_inbound_message_id",
			"payment_webhook_event_uq_request_signature",
		];

		for (const indexName of requiredIndexNames) {
			expect(allSchemaText).toContain(indexName);
		}
	});
});
