import type { AppContractClient } from "@my-app/api-contract/routers";
import z from "zod";
import { orpcTool } from "../lib/orpc-tool";

export const createCreateTodoTool = (client: AppContractClient) =>
	orpcTool(
		z.object({ text: z.string().trim().min(1).max(240) }),
		"Create a new todo item.",
		async ({ text }) => {
			await client.todo.create({ text });
			const todos = await client.todo.getAll();
			return {
				created: true,
				total: todos.length,
			};
		},
	);
