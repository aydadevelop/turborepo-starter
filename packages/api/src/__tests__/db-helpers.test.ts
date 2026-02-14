import { organization } from "@full-stack-cf-app/db/schema/auth";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import {
	clearTestDatabase,
	createTestDatabase,
} from "@full-stack-cf-app/db/test";
import { sql } from "drizzle-orm";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const testDbState = createTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const { insertAndReturn, requireManaged, requireOwned, buildUpdatePayload } =
	await import("../lib/db-helpers");

describe("db-helpers", () => {
	beforeAll(() => {
		testDbState.db.run(sql`PRAGMA foreign_keys = ON`);
	});

	afterAll(() => {
		testDbState.close();
	});

	beforeEach(() => {
		clearTestDatabase(testDbState.db);
		testDbState.db
			.insert(organization)
			.values({
				id: "org-1",
				name: "Test Org",
				slug: "test-org",
			})
			.run();
	});

	describe("insertAndReturn", () => {
		it("inserts and returns the created row", async () => {
			const result = await insertAndReturn(boat, {
				id: "boat-1",
				organizationId: "org-1",
				name: "Test Boat",
				slug: "test-boat",
				status: "active",
				passengerCapacity: 10,
				minimumHours: 1,
				timezone: "UTC",
			});

			expect(result.id).toBe("boat-1");
			expect(result.name).toBe("Test Boat");
			expect(result.organizationId).toBe("org-1");
		});
	});

	describe("requireManaged", () => {
		it("returns the row when it belongs to the organization", async () => {
			testDbState.db
				.insert(boat)
				.values({
					id: "boat-2",
					organizationId: "org-1",
					name: "Managed Boat",
					slug: "managed-boat",
					status: "active",
					passengerCapacity: 8,
					minimumHours: 2,
					timezone: "UTC",
				})
				.run();

			const result = await requireManaged(boat, "boat-2", "org-1");
			expect(result.id).toBe("boat-2");
			expect(result.name).toBe("Managed Boat");
		});

		it("throws NOT_FOUND when ID does not exist", async () => {
			await expect(
				requireManaged(boat, "nonexistent", "org-1")
			).rejects.toMatchObject({
				code: "NOT_FOUND",
			});
		});

		it("throws NOT_FOUND when org does not match", async () => {
			testDbState.db
				.insert(boat)
				.values({
					id: "boat-3",
					organizationId: "org-1",
					name: "Other Org Boat",
					slug: "other-org-boat",
					status: "active",
					passengerCapacity: 6,
					minimumHours: 1,
					timezone: "UTC",
				})
				.run();

			await expect(
				requireManaged(boat, "boat-3", "org-wrong")
			).rejects.toMatchObject({
				code: "NOT_FOUND",
			});
		});

		it("includes custom error message when provided", async () => {
			await expect(
				requireManaged(boat, "nope", "org-1", "Boat not found")
			).rejects.toMatchObject({
				code: "NOT_FOUND",
				message: "Boat not found",
			});
		});
	});

	describe("requireOwned", () => {
		it("returns the row when both columns match", async () => {
			testDbState.db
				.insert(boat)
				.values({
					id: "boat-4",
					organizationId: "org-1",
					name: "Owned Boat",
					slug: "owned-boat",
					status: "active",
					passengerCapacity: 4,
					minimumHours: 1,
					timezone: "UTC",
				})
				.run();

			const result = await requireOwned(
				boat,
				boat.id,
				"boat-4",
				boat.organizationId,
				"org-1"
			);
			expect(result.id).toBe("boat-4");
		});

		it("throws NOT_FOUND when no match", async () => {
			await expect(
				requireOwned(
					boat,
					boat.id,
					"nope",
					boat.organizationId,
					"org-1",
					"Not owned"
				)
			).rejects.toMatchObject({
				code: "NOT_FOUND",
				message: "Not owned",
			});
		});
	});
});

describe("buildUpdatePayload", () => {
	it("strips undefined values and adds updatedAt", () => {
		const payload = buildUpdatePayload({
			name: "Updated",
			description: undefined,
			status: "active",
		});

		expect(payload.name).toBe("Updated");
		expect(payload.status).toBe("active");
		expect(payload).not.toHaveProperty("description");
		expect(payload.updatedAt).toBeInstanceOf(Date);
	});

	it("keeps null values", () => {
		const payload = buildUpdatePayload({
			name: null,
		});

		expect(payload.name).toBeNull();
		expect(payload.updatedAt).toBeInstanceOf(Date);
	});

	it("returns only updatedAt for empty input", () => {
		const payload = buildUpdatePayload({});
		expect(Object.keys(payload)).toEqual(["updatedAt"]);
	});
});
