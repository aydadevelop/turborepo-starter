export const SUPPORT_ERROR_CODES = {
	duplicateInboundMessage: "DUPLICATE_INBOUND_MESSAGE",
	notFound: "NOT_FOUND",
} as const;

export type SupportErrorCode =
	(typeof SUPPORT_ERROR_CODES)[keyof typeof SUPPORT_ERROR_CODES];

export class SupportError extends Error {
	readonly code: SupportErrorCode;

	constructor(code: SupportErrorCode, message = code) {
		super(message);
		this.code = code;
		this.name = "SupportError";
	}
}

export const isSupportErrorCode = (
	error: unknown,
	code: SupportErrorCode,
): boolean =>
	(error instanceof SupportError && error.code === code) ||
	(error instanceof Error && error.message === code);
