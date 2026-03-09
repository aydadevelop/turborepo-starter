import type { EventBus } from "@my-app/events";

export interface WorkflowContext {
	organizationId: string;
	actorUserId?: string;
	idempotencyKey: string;
	eventBus: EventBus;
}

export type CompletedStep = {
	name: string;
	output: unknown;
	compensate?: (output: unknown, ctx: WorkflowContext) => Promise<void>;
};

export type InternalWorkflowContext = WorkflowContext & {
	__completed: CompletedStep[];
};

export type StepFn<TIn, TOut> = ((input: TIn, ctx: WorkflowContext) => Promise<TOut>) & {
	stepName: string;
	compensate?: (output: TOut, ctx: WorkflowContext) => Promise<void>;
};
