/**
 * @deprecated Use `formatMutationError` from `$lib/mutation-result` instead.
 */
import { formatMutationError as baseFormatMutationError } from "$lib/mutation-result";

export type { MutationResult } from "$lib/mutation-result";
export const formatMutationError = baseFormatMutationError;
export const formatOrgAccountError = baseFormatMutationError;
