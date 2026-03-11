import type { SupportEmailIntakePayload } from "@my-app/api-contract/contracts/support-email-intake";
import PostalMime from "postal-mime";

export interface SupportEmailWorkerMessage {
	from: string;
	headers: Headers;
	raw: ReadableStream | null;
	setReject?: (reason: string) => void;
	to: string;
}

interface ParsedMailbox {
	address: string;
	name?: string;
}

interface ParsedPostalMimeAddress {
	address?: string;
	name?: string;
}

interface ParsedPostalMimeAttachment {
	contentType?: string;
	disposition?: string;
	filename?: string;
}

interface ParsedPostalMimeResult {
	attachments?: ParsedPostalMimeAttachment[];
	date?: string;
	from?: ParsedPostalMimeAddress;
	headers?: Array<{ key?: string; value?: string }>;
	html?: string;
	messageId?: string;
	subject?: string;
	text?: string;
	to?: ParsedPostalMimeAddress[];
}

const MAILBOX_PATTERN = /^(?:"?([^"]*)"?\s)?<([^>]+)>$/;
const REFERENCES_PATTERN = /<([^>]+)>/g;

export const buildSupportInboundEmailPayload = async (
	message: SupportEmailWorkerMessage
): Promise<SupportEmailIntakePayload> => {
	const rawBytes = await new Response(message.raw).arrayBuffer();
	const parser = new PostalMime();
	const parsed = (await parser.parse(rawBytes)) as ParsedPostalMimeResult;
	const headerValues = toHeaderRecord(parsed.headers, message.headers);
	const from = parseMailbox(parsed.from) ??
		parseMailboxString(message.from) ?? {
			address: "unknown@example.com",
		};
	const to =
		parsed.to
			?.map(parseMailbox)
			.filter((value): value is ParsedMailbox => Boolean(value)) ??
		parseAddressList(message.to);
	const messageId =
		normalizeMessageId(parsed.messageId) ??
		normalizeMessageId(firstHeaderValue(headerValues, "message-id")) ??
		(await hashFallbackIdentity(rawBytes, message.from, message.to));

	return {
		attachments:
			parsed.attachments?.map((attachment) => ({
				contentType: attachment.contentType,
				disposition: attachment.disposition,
				filename: attachment.filename,
			})) ?? [],
		date: parsed.date ?? firstHeaderValue(headerValues, "date") ?? undefined,
		from,
		headers: headerValues,
		html: parsed.html,
		inReplyTo:
			normalizeMessageId(firstHeaderValue(headerValues, "in-reply-to")) ??
			undefined,
		messageId,
		references: extractMessageIds(firstHeaderValue(headerValues, "references")),
		subject:
			parsed.subject ?? firstHeaderValue(headerValues, "subject") ?? undefined,
		text: parsed.text,
		to:
			to.length > 0
				? to
				: [
						{
							address: "support@example.com",
						},
					],
	};
};

const toHeaderRecord = (
	parsedHeaders: ParsedPostalMimeResult["headers"],
	fallbackHeaders: Headers
): Record<string, string[]> => {
	const headers: Record<string, string[]> = {};

	for (const header of parsedHeaders ?? []) {
		const key = header.key?.trim().toLowerCase();
		const value = header.value?.trim();
		if (!(key && value)) {
			continue;
		}

		if (!headers[key]) {
			headers[key] = [];
		}
		headers[key].push(value);
	}

	if (Object.keys(headers).length > 0) {
		return headers;
	}

	fallbackHeaders.forEach((value, key) => {
		const normalizedKey = key.trim().toLowerCase();
		if (!headers[normalizedKey]) {
			headers[normalizedKey] = [];
		}
		headers[normalizedKey].push(value.trim());
	});

	return headers;
};

const parseMailbox = (
	address: ParsedPostalMimeAddress | undefined
): ParsedMailbox | null => {
	if (!address?.address?.trim()) {
		return null;
	}

	return {
		address: address.address.trim().toLowerCase(),
		name: address.name?.trim() || undefined,
	};
};

const parseMailboxString = (value: string): ParsedMailbox | null => {
	const match = value.match(MAILBOX_PATTERN);
	if (match?.[2]) {
		return {
			address: match[2].trim().toLowerCase(),
			name: match[1]?.trim() || undefined,
		};
	}

	const trimmed = value.trim().toLowerCase();
	return trimmed ? { address: trimmed } : null;
};

const parseAddressList = (value: string): ParsedMailbox[] =>
	value
		.split(",")
		.map((entry) => parseMailboxString(entry))
		.filter((entry): entry is ParsedMailbox => Boolean(entry));

const firstHeaderValue = (
	headers: Record<string, string[]>,
	key: string
): string | undefined => headers[key.toLowerCase()]?.[0];

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

const extractMessageIds = (value: string | undefined): string[] => {
	if (!value) {
		return [];
	}

	const matches = value.match(REFERENCES_PATTERN);
	if (!matches) {
		const normalized = normalizeMessageId(value);
		return normalized ? [normalized] : [];
	}

	return matches
		.map((match) => normalizeMessageId(match))
		.filter((entry): entry is string => Boolean(entry));
};

const hashFallbackIdentity = async (
	rawBytes: ArrayBuffer,
	from: string,
	to: string
): Promise<string> => {
	const encoder = new TextEncoder();
	const seed = `${from}\n${to}\n${arrayBufferToHex(rawBytes)}`;
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(seed));
	return `generated-${arrayBufferToHex(digest).slice(0, 32)}`;
};

const arrayBufferToHex = (value: ArrayBuffer): string =>
	[...new Uint8Array(value)]
		.map((entry) => entry.toString(16).padStart(2, "0"))
		.join("");
