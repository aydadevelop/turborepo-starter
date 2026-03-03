import { member, organization, user } from "@my-app/db/schema/auth";
import { bootstrapTestDatabase } from "@my-app/db/test";
import { describe, expect, it, vi } from "vitest";

const testDbState = bootstrapTestDatabase({
	seed: async (db) => {
		await db.insert(organization).values({
			id: "org-1",
			name: "Test Org",
			slug: "test-org",
		});
		await db.insert(user).values({
			id: "user-1",
			name: "Test User",
			email: "user-1@example.com",
			emailVerified: true,
		});
	},
});

vi.doMock("@my-app/db", () => ({
	get db() {
		return testDbState.db;
	},
}));

const { insertAndReturn, requireManaged, requireOwned, buildUpdatePayload } =
	await import("../lib/db-helpers");

describe("db-helpers", () => {
	describe("insertAndReturn", () => {
		it("inserts and returns the created row", async () => {
			const result = await insertAndReturn(member, {
				id: "member-1",
				organizationId: "org-1",
				userId: "user-1",
				role: "member",
			});

			expect(result.id).toBe("member-1");
			expect(result.organizationId).toBe("org-1");
			expect(result.userId).toBe("user-1");
		});
	});

	describe("requireManaged", () => {
		it("returns the row when it belongs to the organization", async () => {
			await testDbState.db.insert(member).values({
				id: "member-2",
				organizationId: "org-1",
				userId: "user-1",
				role: "manager",
			});

			const result = await requireManaged(member, "member-2", "org-1");
			expect(result.id).toBe("member-2");
			expect(result.role).toBe("manager");
		});

		it("throws NOT_FOUND when ID does not exist", async () => {
			await expect(
				requireManaged(member, "nonexistent", "org-1")
			).rejects.toMatchObject({
				code: "NOT_FOUND",
			});
		});

		it("throws NOT_FOUND when org does not match", async () => {
			await testDbState.db.insert(member).values({
				id: "member-3",
				organizationId: "org-1",
				userId: "user-1",
				role: "member",
			});

			await expect(
				requireManaged(member, "member-3", "org-wrong")
			).rejects.toMatchObject({
				code: "NOT_FOUND",
			});
		});
	});

	describe("requireOwned", () => {
		it("returns the row when both columns match", async () => {
			await testDbState.db.insert(member).values({
				id: "member-4",
				organizationId: "org-1",
				userId: "user-1",
				role: "member",
			});

			const result = await requireOwned(
				member,
				member.id,
				"member-4",
				member.organizationId,
				"org-1"
			);
			expect(result.id).toBe("member-4");
		});

		it("throws NOT_FOUND when no match", async () => {
			await expect(
				requireOwned(
					member,
					member.id,
					"nope",
					member.organizationId,
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
			role: "org_admin",
			description: undefined,
		});

		expect(payload.role).toBe("org_admin");
		expect(payload).not.toHaveProperty("description");
		expect(payload.updatedAt).toBeInstanceOf(Date);
	});

	it("keeps null values", () => {
		const payload = buildUpdatePayload({
			role: null,
		});

		expect(payload.role).toBeNull();
		expect(payload.updatedAt).toBeInstanceOf(Date);
	});

	it("returns only updatedAt for empty input", () => {
		const payload = buildUpdatePayload({});
		expect(Object.keys(payload)).toEqual(["updatedAt"]);
	});
});
