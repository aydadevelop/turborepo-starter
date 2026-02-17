export type ToolState =
	| "input-streaming"
	| "input-available"
	| "approval-requested"
	| "approval-responded"
	| "output-available"
	| "output-error"
	| "output-denied";

export interface ToolPart {
	type: string;
	state: ToolState;
	input?: Record<string, unknown>;
	output?: Record<string, unknown>;
	toolCallId?: string;
	errorText?: string;
}
