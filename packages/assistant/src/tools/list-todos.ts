import type { AppContractClient } from "@my-app/api-contract/routers";
import z from "zod";
import { orpcTool } from "../lib/orpc-tool";

export const createListTodosTool = (client: AppContractClient) =>
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
