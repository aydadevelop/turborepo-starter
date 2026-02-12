import { db } from "@full-stack-cf-app/db";
import { todo } from "@full-stack-cf-app/db/schema/todo";
import { eq } from "drizzle-orm";
import z from "zod";

import { publicProcedure } from "../index";

const todoOutputSchema = z.object({
	id: z.number(),
	text: z.string(),
	completed: z.boolean(),
});

const d1ResultOutputSchema = z.object({
	success: z.boolean().optional(),
	results: z.array(z.unknown()).optional(),
	meta: z.record(z.string(), z.unknown()).optional(),
});

export const todoRouter = {
	getAll: publicProcedure
		.route({
			tags: ["Todo"],
			summary: "List all todos",
			description: "Get all todo items.",
		})
		.output(z.array(todoOutputSchema))
		.handler(async () => {
			return await db.select().from(todo);
		}),

	create: publicProcedure
		.route({
			tags: ["Todo"],
			summary: "Create todo",
			description: "Create a new todo item.",
		})
		.input(z.object({ text: z.string().min(1) }))
		.output(d1ResultOutputSchema)
		.handler(async ({ input }) => {
			return await db.insert(todo).values({
				text: input.text,
			});
		}),

	toggle: publicProcedure
		.route({
			tags: ["Todo"],
			summary: "Toggle todo",
			description: "Toggle the completed status of a todo item.",
		})
		.input(z.object({ id: z.number(), completed: z.boolean() }))
		.output(d1ResultOutputSchema)
		.handler(async ({ input }) => {
			return await db
				.update(todo)
				.set({ completed: input.completed })
				.where(eq(todo.id, input.id));
		}),

	delete: publicProcedure
		.route({
			tags: ["Todo"],
			summary: "Delete todo",
			description: "Delete a todo item by ID.",
		})
		.input(z.object({ id: z.number() }))
		.output(d1ResultOutputSchema)
		.handler(async ({ input }) => {
			return await db.delete(todo).where(eq(todo.id, input.id));
		}),
};
