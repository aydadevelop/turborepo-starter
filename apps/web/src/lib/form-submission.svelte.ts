/**
 * Standardized form submission pipeline for TanStack Form + Zod schemas.
 *
 * Replaces the repeated pattern of:
 *   - `submitError = $state<string | null>(null)`
 *   - `successMessage = $state<string | null>(null)`
 *   - Manual `onSubmit` wiring with: validate → call mutation → set error/success → invalidate → reset
 *
 * The org-account DI approach (explicit deps interface) remains canonical
 * for testable submit functions. This pipeline standardizes the *component-side*
 * wiring that calls those functions.
 *
 * Usage:
 * ```ts
 * const submission = createFormSubmission({
 *   submit: async (values) => {
 *     return await submitInviteMember(deps, values);
 *   },
 *   onSuccess: (data) => {
 *     form.reset(defaultValues);
 *   },
 * });
 *
 * const form = createForm(() => ({
 *   defaultValues,
 *   onSubmit: ({ value }) => submission.execute(value),
 *   validators: { onSubmit: mySchema },
 * }));
 * ```
 *
 * In template:
 * ```svelte
 * {#if submission.successMessage}
 *   <Text variant="muted">{submission.successMessage}</Text>
 * {/if}
 * {#if submission.error}
 *   <Text variant="error">{submission.error}</Text>
 * {/if}
 * ```
 */

import type { MutationResult } from "$lib/mutation-result";
import { formatMutationError } from "$lib/mutation-result";

export interface FormSubmissionOptions<TInput, TOutput> {
	/**
	 * The submit function. Should return a MutationResult.
	 * If it throws, the error is caught and formatted.
	 */
	submit: (input: TInput) => Promise<MutationResult<TOutput>>;

	/**
	 * Called after a successful submission with the result data.
	 * Use this to reset the form, navigate, show a toast, etc.
	 */
	onSuccess?: (data: TOutput) => void;

	/**
	 * Format the success message. Return null to skip.
	 * Defaults to no success message.
	 */
	formatSuccess?: (data: TOutput) => string | null;

	/**
	 * Fallback error message when the error shape is unrecognizable.
	 */
	errorFallback?: string;
}

export interface FormSubmission<TInput, TOutput> {
	/** Current error message, or null. */
	readonly error: string | null;
	/** Current success message, or null. */
	readonly successMessage: string | null;
	/** Whether a submission is in progress. */
	readonly pending: boolean;
	/** Execute the submission pipeline. */
	execute(input: TInput): Promise<void>;
	/** Clear error and success state. */
	reset(): void;
}

export function createFormSubmission<TInput, TOutput = void>(
	options: FormSubmissionOptions<TInput, TOutput>,
): FormSubmission<TInput, TOutput> {
	let error = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let pending = $state(false);

	return {
		get error() {
			return error;
		},
		get successMessage() {
			return successMessage;
		},
		get pending() {
			return pending;
		},

		async execute(input: TInput) {
			error = null;
			successMessage = null;
			pending = true;

			try {
				const result = await options.submit(input);

				if (!result.ok) {
					error = result.message;
					return;
				}

				if (options.formatSuccess) {
					successMessage = options.formatSuccess(result.data);
				}

				options.onSuccess?.(result.data);
			} catch (e) {
				error = formatMutationError(
					e,
					options.errorFallback ?? "Something went wrong. Please try again.",
				);
			} finally {
				pending = false;
			}
		},

		reset() {
			error = null;
			successMessage = null;
		},
	};
}
