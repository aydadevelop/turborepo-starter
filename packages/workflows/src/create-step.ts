import type { InternalWorkflowContext, StepFn, WorkflowContext } from "./types";

export const createStep = <TIn, TOut>(
	name: string,
	invoke: (input: TIn, ctx: WorkflowContext) => Promise<TOut>,
	compensate?: (output: TOut, ctx: WorkflowContext) => Promise<void>
): StepFn<TIn, TOut> => {
	const stepFn = async (input: TIn, ctx: WorkflowContext): Promise<TOut> => {
		// ctx is guaranteed to be InternalWorkflowContext at runtime (from createWorkflow)
		const internalCtx = ctx as InternalWorkflowContext;
		const output = await invoke(input, ctx);

		internalCtx.__completed.push({
			name,
			output,
			// Cast compensate to accept `unknown` for storage in the heterogeneous array
			compensate: compensate
				? (out, c) => compensate(out as TOut, c)
				: undefined,
		});

		return output;
	};

	stepFn.stepName = name;
	stepFn.compensate = compensate;

	return stepFn;
};
