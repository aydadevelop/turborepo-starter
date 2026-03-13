/**
 * Shared result type for frontend mutations.
 *
 * Provides a discriminated union for mutation outcomes and a generic
 * error formatter that extracts human-readable messages from unknown
 * error shapes (oRPC errors, auth-client errors, raw strings, etc.).
 *
 * All features should import from here — not from each other.
 */

export type MutationResult<T = void> =
	| { ok: true; data: T }
	| { ok: false; message: string };

/**
 * Extract a human-readable error message from an unknown error value.
 *
 * Handles:
 * - string errors
 * - Error instances
 * - oRPC / auth-client `{ error: { message } }` shapes
 * - Objects with a `message` property
 */
export function formatMutationError(
	error: unknown,
	fallback = "Something went wrong. Please try again.",
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
