import { oc } from "@orpc/contract";
import z from "zod";

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

export const todoContract = {
	getAll: oc
		.route({
			tags: ["Todo"],
			summary: "List all todos",
			description: "Get all todo items.",
		})
		.output(z.array(todoOutputSchema)),

	create: oc
		.route({
			tags: ["Todo"],
			summary: "Create todo",
			description: "Create a new todo item.",
		})
		.input(z.object({ text: z.string().min(1) }))
		.output(d1ResultOutputSchema),

	toggle: oc
		.route({
			tags: ["Todo"],
			summary: "Toggle todo",
			description: "Toggle the completed status of a todo item.",
		})
		.input(z.object({ id: z.number(), completed: z.boolean() }))
		.output(d1ResultOutputSchema),

	delete: oc
		.route({
			tags: ["Todo"],
			summary: "Delete todo",
			description: "Delete a todo item by ID.",
		})
		.input(z.object({ id: z.number() }))
		.output(d1ResultOutputSchema),
};
