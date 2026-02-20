import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createListTodosTool = (client: AppRouterClient) =>
	tool({
		description: "List todo items from the starter todo API.",
		inputSchema: z.object({
			limit: z.number().int().min(1).max(100).default(20),
		}),
		execute: async ({ limit }) => {
			const todos = await client.todo.getAll();
			return {
				count: todos.length,
				items: todos.slice(0, limit),
			};
		},
	});
