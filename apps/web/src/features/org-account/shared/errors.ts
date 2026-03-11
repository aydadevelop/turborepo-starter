export type MutationResult<T = void> =
	| { ok: true; data: T }
	| { ok: false; message: string };

export function formatOrgAccountError(
	error: unknown,
	fallback = "Something went wrong. Please try again."
): string {
	if (typeof error === "string" && error.trim().length > 0) {
		return error;
	}

	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	if (typeof error === "object" && error !== null) {
		const maybeError = error as {
			message?: unknown;
			error?: { message?: unknown };
		};

		if (
			typeof maybeError.error?.message === "string" &&
			maybeError.error.message.trim().length > 0
		) {
			return maybeError.error.message;
		}

		if (
			typeof maybeError.message === "string" &&
			maybeError.message.trim().length > 0
		) {
			return maybeError.message;
		}
	}

	return fallback;
}
