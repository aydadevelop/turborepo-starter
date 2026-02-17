import { getContext, setContext } from "svelte";

export class MessageClass {}

const MESSAGE_KEY = Symbol("message");

export function setMessageContext(contextInstance: MessageClass) {
	setContext(MESSAGE_KEY, contextInstance);
}

export function getMessageContext(): MessageClass {
	const context = getContext<MessageClass>(MESSAGE_KEY);

	if (!context) {
		throw new Error("Message subcomponents must be used within Message");
	}

	return context;
}
