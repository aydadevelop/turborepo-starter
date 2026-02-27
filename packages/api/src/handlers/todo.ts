import { db } from "@my-app/db";
import { todo } from "@my-app/db/schema/todo";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../index";

export const todoRouter = {
	getAll: protectedProcedure.todo.getAll.handler(async () => {
		return await db.select().from(todo);
	}),

	create: protectedProcedure.todo.create.handler(async ({ input }) => {
		return await db.insert(todo).values({
			text: input.text,
		});
	}),

	toggle: protectedProcedure.todo.toggle.handler(async ({ input }) => {
		return await db
			.update(todo)
			.set({ completed: input.completed })
			.where(eq(todo.id, input.id));
	}),

	delete: protectedProcedure.todo.delete.handler(async ({ input }) => {
		return await db.delete(todo).where(eq(todo.id, input.id));
	}),
};
