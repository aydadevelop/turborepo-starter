import type { EventBus } from "@my-app/events";

export interface WorkflowContext {
	actorUserId?: string;
	eventBus: EventBus;
	idempotencyKey: string;
	organizationId: string;
}

export interface CompletedStep {
	compensate?: (output: unknown, ctx: WorkflowContext) => Promise<void>;
	name: string;
	output: unknown;
}

export type InternalWorkflowContext = WorkflowContext & {
	__completed: CompletedStep[];
};

export type StepFn<TIn, TOut> = ((
	input: TIn,
	ctx: WorkflowContext,
) => Promise<TOut>) & {
	stepName: string;
	compensate?: (output: TOut, ctx: WorkflowContext) => Promise<void>;
};
