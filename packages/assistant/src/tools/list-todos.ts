import type { AppRouterClient } from "@my-app/api/routers";
import { orpcTool } from "../lib/orpc-tool";
import z from "zod";

export const createListTodosTool = (client: AppRouterClient) =>
	orpcTool(
		z.object({ limit: z.number().int().min(1).max(100).default(20) }),
		"List todo items from the starter todo API.",
		async ({ limit }) => {
			const todos = await client.todo.getAll();
			return {
				count: todos.length,
				items: todos.slice(0, limit),
			};
		},
	);
