export type ToolState =
	| "input-streaming"
	| "input-available"
	| "approval-requested"
	| "approval-responded"
	| "output-available"
	| "output-error"
	| "output-denied";

export interface ToolPart {
	approval?: { id: string };
	errorText?: string;
	input?: Record<string, unknown>;
	output?: Record<string, unknown>;
	state: ToolState;
	toolCallId?: string;
	type: string;
}
