import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createCreateTodoTool = (client: AppRouterClient) =>
	tool({
		description: "Create a new todo item.",
		inputSchema: z.object({
			text: z.string().trim().min(1).max(240),
		}),
		execute: async ({ text }) => {
			await client.todo.create({ text });
			const todos = await client.todo.getAll();
			return {
				created: true,
				total: todos.length,
			};
		},
	});
