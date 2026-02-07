import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { member, organization, user } from "../schema/auth";
import {
	boat,
	boatAmenity,
	boatDock,
	boatPricingProfile,
	boatPricingRule,
} from "../schema/boat";
import { todo } from "../schema/todo";
import {
	clearTestDatabase,
	createTestDatabase,
	type TestDatabase,
} from "../test";

describe("Test Database Setup", () => {
	let db: TestDatabase;
	let close: () => void;

	beforeEach(() => {
		const testDb = createTestDatabase();
		db = testDb.db;
		close = testDb.close;
	});

	afterEach(() => {
		close();
	});

	describe("User table", () => {
		it("can create a user", async () => {
			const testUser = {
				id: "user-1",
				name: "John Doe",
				email: "john@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			await db.insert(user).values(testUser);

			const users = await db.select().from(user);
			expect(users).toHaveLength(1);
			expect(users[0]).toBeDefined();
			expect(users[0]?.email).toBe("john@example.com");
		});

		it("enforces unique email constraint", async () => {
			const testUser = {
				id: "user-1",
				name: "John Doe",
				email: "john@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			await db.insert(user).values(testUser);

			await expect(
				db.insert(user).values({ ...testUser, id: "user-2" })
			).rejects.toThrow();
		});
	});

	describe("Todo table", () => {
		it("can create a todo", async () => {
			await db.insert(todo).values({ text: "Buy milk" });

			const todos = await db.select().from(todo);
			expect(todos).toHaveLength(1);
			expect(todos[0]).toBeDefined();
			expect(todos[0]?.text).toBe("Buy milk");
			expect(todos[0]?.completed).toBe(false);
		});

		it("can toggle todo completion", async () => {
			const [inserted] = await db
				.insert(todo)
				.values({ text: "Buy milk" })
				.returning();
			expect(inserted).toBeDefined();
			if (!inserted) {
				throw new Error("Insert returned no row");
			}

			await db
				.update(todo)
				.set({ completed: true })
				.where(eq(todo.id, inserted.id));

			const [updated] = await db
				.select()
				.from(todo)
				.where(eq(todo.id, inserted.id));
			expect(updated).toBeDefined();
			expect(updated?.completed).toBe(true);
		});

		it("can delete a todo", async () => {
			const [inserted] = await db
				.insert(todo)
				.values({ text: "Buy milk" })
				.returning();
			expect(inserted).toBeDefined();
			if (!inserted) {
				throw new Error("Insert returned no row");
			}

			await db.delete(todo).where(eq(todo.id, inserted.id));

			const todos = await db.select().from(todo);
			expect(todos).toHaveLength(0);
		});
	});

	describe("Organization membership table", () => {
		it("can create organization member relation", async () => {
			await db.insert(user).values({
				id: "org-user-1",
				name: "Org User",
				email: "org-user@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(organization).values({
				id: "org-1",
				name: "Primary Org",
				slug: "primary-org",
				createdAt: new Date(),
			});

			await db.insert(member).values({
				id: "member-1",
				organizationId: "org-1",
				userId: "org-user-1",
				role: "org_owner",
				createdAt: new Date(),
			});

			const members = await db.select().from(member);
			expect(members).toHaveLength(1);
			expect(members[0]?.role).toBe("org_owner");
		});

		it("enforces one membership per user per organization", async () => {
			await db.insert(user).values({
				id: "org-user-2",
				name: "Org User 2",
				email: "org-user-2@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(organization).values({
				id: "org-2",
				name: "Secondary Org",
				slug: "secondary-org",
				createdAt: new Date(),
			});

			await db.insert(member).values({
				id: "member-2",
				organizationId: "org-2",
				userId: "org-user-2",
				role: "manager",
				createdAt: new Date(),
			});

			await expect(
				db.insert(member).values({
					id: "member-3",
					organizationId: "org-2",
					userId: "org-user-2",
					role: "agent",
					createdAt: new Date(),
				})
			).rejects.toThrow();
		});
	});

	describe("Boat table", () => {
		it("can create a boat with dock relation scoped to an organization", async () => {
			await db.insert(organization).values({
				id: "org-boat-1",
				name: "Boat Org",
				slug: "boat-org",
				createdAt: new Date(),
			});

			await db.insert(boatDock).values({
				id: "dock-1",
				organizationId: "org-boat-1",
				name: "Central Dock",
				slug: "central-dock",
				address: "Main embankment",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-1",
				organizationId: "org-boat-1",
				dockId: "dock-1",
				name: "Sea Explorer",
				slug: "sea-explorer",
				type: "motor",
				passengerCapacity: 8,
				crewCapacity: 1,
				timezone: "UTC",
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const boats = await db.select().from(boat);
			expect(boats).toHaveLength(1);
			expect(boats[0]?.organizationId).toBe("org-boat-1");
			expect(boats[0]?.slug).toBe("sea-explorer");
			expect(boats[0]?.dockId).toBe("dock-1");
		});

		it("enforces unique slug inside the same organization", async () => {
			await db.insert(organization).values({
				id: "org-boat-2",
				name: "Boat Org 2",
				slug: "boat-org-2",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-2",
				organizationId: "org-boat-2",
				name: "Wave Rider",
				slug: "wave-rider",
				type: "motor",
				passengerCapacity: 6,
				timezone: "UTC",
				status: "draft",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(boat).values({
					id: "boat-3",
					organizationId: "org-boat-2",
					name: "Wave Rider 2",
					slug: "wave-rider",
					type: "yacht",
					passengerCapacity: 10,
					timezone: "UTC",
					status: "active",
					isActive: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});

		it("enforces unique amenity key per boat", async () => {
			await db.insert(organization).values({
				id: "org-boat-3",
				name: "Boat Org 3",
				slug: "boat-org-3",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-4",
				organizationId: "org-boat-3",
				name: "Sea Fox",
				slug: "sea-fox",
				type: "motor",
				passengerCapacity: 4,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(boatAmenity).values({
				id: "amenity-1",
				boatId: "boat-4",
				key: "toilet",
				label: "Toilet",
				isEnabled: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(boatAmenity).values({
					id: "amenity-2",
					boatId: "boat-4",
					key: "toilet",
					label: "Toilet Duplicate",
					isEnabled: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});

		it("supports pricing profile and pricing rules relation", async () => {
			await db.insert(organization).values({
				id: "org-boat-4",
				name: "Boat Org 4",
				slug: "boat-org-4",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-5",
				organizationId: "org-boat-4",
				name: "Aurora",
				slug: "aurora",
				type: "catamaran",
				passengerCapacity: 12,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(boatPricingProfile).values({
				id: "profile-1",
				boatId: "boat-5",
				name: "Default",
				currency: "RUB",
				baseHourlyPriceCents: 120_000,
				minimumHours: 2,
				depositPercentage: 20,
				serviceFeePercentage: 5,
				affiliateFeePercentage: 0,
				taxPercentage: 6,
				acquiringFeePercentage: 3,
				validFrom: new Date(),
				isDefault: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(boatPricingRule).values({
				id: "rule-1",
				boatId: "boat-5",
				pricingProfileId: "profile-1",
				name: "Weekend surcharge",
				ruleType: "weekend_surcharge",
				conditionJson: '{"days":[6,0]}',
				adjustmentType: "percentage",
				adjustmentValue: 15,
				priority: 10,
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const rules = await db.select().from(boatPricingRule);
			expect(rules).toHaveLength(1);
			expect(rules[0]?.pricingProfileId).toBe("profile-1");
		});
	});

	describe("clearTestDatabase", () => {
		it("clears all data", async () => {
			await db.insert(user).values({
				id: "user-1",
				name: "John",
				email: "john@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			await db.insert(todo).values({ text: "Test" });

			clearTestDatabase(db);

			const users = await db.select().from(user);
			const todos = await db.select().from(todo);
			expect(users).toHaveLength(0);
			expect(todos).toHaveLength(0);
		});
	});
});
