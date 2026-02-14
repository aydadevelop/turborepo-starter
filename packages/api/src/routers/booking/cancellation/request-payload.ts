import type {
	BookingCancellationEvidence,
	BookingCancellationReasonCode,
} from "./policy.templates";

export interface StoredCancellationRequestPayload {
	reason?: string;
	reasonCode?: BookingCancellationReasonCode;
	evidence?: BookingCancellationEvidence[];
}

const STORAGE_PREFIX = "__CANCEL_PAYLOAD_V1__:";

export const serializeCancellationRequestPayload = (
	payload: StoredCancellationRequestPayload
) => {
	return `${STORAGE_PREFIX}${JSON.stringify(payload)}`;
};

export const parseCancellationRequestPayload = (
	rawValue: string | null | undefined
): StoredCancellationRequestPayload => {
	if (!rawValue) {
		return {};
	}

	if (!rawValue.startsWith(STORAGE_PREFIX)) {
		return { reason: rawValue };
	}

	try {
		const rawPayload = JSON.parse(
			rawValue.slice(STORAGE_PREFIX.length)
		) as StoredCancellationRequestPayload;
		return {
			reason:
				typeof rawPayload.reason === "string" ? rawPayload.reason : undefined,
			reasonCode:
				typeof rawPayload.reasonCode === "string"
					? rawPayload.reasonCode
					: undefined,
			evidence: Array.isArray(rawPayload.evidence)
				? rawPayload.evidence
				: undefined,
		};
	} catch {
		return {};
	}
};
