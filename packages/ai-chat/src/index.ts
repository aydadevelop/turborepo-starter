export { Chat } from "@ai-sdk/svelte";
export {
	isToolUIPart,
	lastAssistantMessageIsCompleteWithToolCalls,
	type UIMessage,
} from "ai";
export * from "./components/prompt-kit/chat-container/index.js";
export * from "./components/prompt-kit/loader/index.js";
export * from "./components/prompt-kit/markdown/index.js";
// Re-export prompt-kit components for convenience
export * from "./components/prompt-kit/message/index.js";
export * from "./components/prompt-kit/prompt-input/index.js";
export {
	Tool,
	ToolBadge,
	ToolComposed,
	ToolContent,
	ToolDetails,
	ToolHeader,
} from "./components/prompt-kit/tool/index.js";
