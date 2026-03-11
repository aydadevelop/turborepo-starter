import type { SupportEmailIntakePayload } from "@my-app/api-contract/contracts/support-email-intake";
import type { ProcessInboundSupportIntentInput } from "@my-app/support";

const normalizeMessageId = (value: string | undefined): string | null => {
	if (!value) {
		return null;
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}

	if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
		return trimmed.slice(1, -1).trim() || null;
	}

	return trimmed;
};

export const toProcessInboundSupportIntentFromEmail = (
	payload: SupportEmailIntakePayload,
	organizationId: string,
): ProcessInboundSupportIntentInput => {
	const normalizedMessageId =
		normalizeMessageId(payload.messageId) ?? payload.messageId.trim();
	const normalizedReferences = payload.references
		.map(normalizeMessageId)
		.filter((value): value is string => Boolean(value));
	const threadId =
		normalizedReferences[0] ??
		normalizeMessageId(payload.inReplyTo) ??
		normalizedMessageId;

	return {
		channel: "email",
		dedupeKey: `email:${normalizedMessageId.toLowerCase()}`,
		defaultDescription: payload.text?.trim() || undefined,
		defaultSubject: payload.subject?.trim() || undefined,
		externalMessageId: normalizedMessageId,
		externalSenderId: payload.from.address,
		externalThreadId: threadId,
		normalizedText: payload.text?.trim() || undefined,
		organizationId,
		payload: {
			attachments: payload.attachments,
			date: payload.date,
			from: payload.from,
			headers: payload.headers,
			html: payload.html,
			inReplyTo: payload.inReplyTo,
			messageId: normalizedMessageId,
			references: normalizedReferences,
			subject: payload.subject,
			text: payload.text,
			to: payload.to,
		},
		senderDisplayName: payload.from.name?.trim() || payload.from.address,
	};
};
