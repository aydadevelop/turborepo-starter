import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { user } from "../schema/auth";
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
