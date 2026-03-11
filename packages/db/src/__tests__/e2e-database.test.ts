import { describe, expect, it } from "vitest";
import {
	assertSafeE2EDatabaseUrl,
	deriveE2EDatabaseUrl,
	resolvePlaywrightDatabaseUrl,
} from "../e2e/database";

const SHARED_DB_ERROR_RE =
	/Refusing to run E2E bootstrap against the default dev database/;

describe("E2E database safety", () => {
	it("derives a dedicated *_e2e database URL from the default dev connection", () => {
		expect(
			deriveE2EDatabaseUrl(
				"postgresql://postgres:postgres@localhost:5432/myapp"
			)
		).toBe("postgresql://postgres:postgres@localhost:5432/myapp_e2e");
	});

	it("refuses the default shared local dev database unless explicitly allowed", () => {
		expect(() =>
			assertSafeE2EDatabaseUrl(
				"postgresql://postgres:postgres@localhost:5432/myapp",
				{}
			)
		).toThrow(SHARED_DB_ERROR_RE);
	});

	it("allows a dedicated local e2e database", () => {
		expect(
			assertSafeE2EDatabaseUrl(
				"postgresql://postgres:postgres@localhost:5432/myapp_e2e",
				{}
			)
		).toBe("postgresql://postgres:postgres@localhost:5432/myapp_e2e");
	});

	it("resolves a dedicated e2e URL by default", () => {
		expect(
			resolvePlaywrightDatabaseUrl({
				DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/myapp",
			})
		).toBe("postgresql://postgres:postgres@localhost:5432/myapp_e2e");
	});
});
