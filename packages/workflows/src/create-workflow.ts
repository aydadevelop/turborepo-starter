import type { InternalWorkflowContext, WorkflowContext } from "./types";

export const createWorkflow = <TIn, TOut>(
	name: string,
	run: (input: TIn, ctx: WorkflowContext) => Promise<TOut>,
) => ({
	name,
	execute: async (
		input: TIn,
		ctx: WorkflowContext,
	): Promise<
		| { success: true; output: TOut }
		| { success: false; error: Error }
	> => {
		const internalCtx: InternalWorkflowContext = { ...ctx, __completed: [] };
		try {
			const output = await run(input, internalCtx);
			return { success: true as const, output };
		} catch (error) {
			// Run compensation in reverse step order — best-effort, swallow errors
			for (const completed of [...internalCtx.__completed].reverse()) {
				if (completed.compensate) {
					await completed.compensate(completed.output, ctx).catch(() => {
						// best-effort: log but do not rethrow
					});
				}
			}
			return {
				success: false as const,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	},
});
