import { describe, expect, it } from "vitest";
import { z } from "zod";

// Test the input validation schemas used in todo router
const createTodoSchema = z.object({ text: z.string().min(1) });
const toggleTodoSchema = z.object({ id: z.number(), completed: z.boolean() });
const deleteTodoSchema = z.object({ id: z.number() });

describe("Todo Input Schemas", () => {
	describe("createTodoSchema", () => {
		it("accepts valid input", () => {
			const result = createTodoSchema.safeParse({ text: "Buy groceries" });
			expect(result.success).toBe(true);
		});

		it("rejects empty text", () => {
			const result = createTodoSchema.safeParse({ text: "" });
			expect(result.success).toBe(false);
		});

		it("rejects missing text", () => {
			const result = createTodoSchema.safeParse({});
			expect(result.success).toBe(false);
		});
	});

	describe("toggleTodoSchema", () => {
		it("accepts valid toggle input", () => {
			const result = toggleTodoSchema.safeParse({ id: 1, completed: true });
			expect(result.success).toBe(true);
		});

		it("rejects invalid id type", () => {
			const result = toggleTodoSchema.safeParse({ id: "1", completed: true });
			expect(result.success).toBe(false);
		});
	});

	describe("deleteTodoSchema", () => {
		it("accepts valid delete input", () => {
			const result = deleteTodoSchema.safeParse({ id: 42 });
			expect(result.success).toBe(true);
		});

		it("rejects missing id", () => {
			const result = deleteTodoSchema.safeParse({});
			expect(result.success).toBe(false);
		});
	});
});
