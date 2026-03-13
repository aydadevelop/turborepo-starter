/**
 * Rune-based composable for confirmation dialogs.
 *
 * Replaces the repeated pattern of declaring 3-4 $state vars
 * (open, targetId, targetLabel, error) per confirmation dialog.
 *
 * Usage:
 * ```svelte
 * <script>
 *   const removeAction = createConfirmAction<string>();
 *
 *   // Open from table row action:
 *   removeAction.request(memberId, memberName);
 *
 *   // In dialog onConfirm:
 *   removeMutation.mutate(
 *     { memberId: removeAction.targetId! },
 *     {
 *       onSuccess: () => removeAction.close(),
 *       onError: (e) => removeAction.fail(formatMutationError(e)),
 *     }
 *   );
 * </script>
 *
 * <ConfirmActionDialog
 *   bind:open={removeAction.open}
 *   errorMessage={removeAction.error}
 *   ...
 * />
 * ```
 */
export function createConfirmAction<TId = string>() {
	let open = $state(false);
	let targetId = $state<TId | null>(null);
	let targetLabel = $state("");
	let error = $state<string | null>(null);

	return {
		get open() {
			return open;
		},
		set open(value: boolean) {
			open = value;
			if (!value) {
				error = null;
			}
		},

		get targetId() {
			return targetId;
		},

		get targetLabel() {
			return targetLabel;
		},

		get error() {
			return error;
		},

		/** Open the dialog targeting a specific item. */
		request(id: TId, label = "") {
			targetId = id;
			targetLabel = label;
			error = null;
			open = true;
		},

		/** Close the dialog and reset state. */
		close() {
			open = false;
			targetId = null;
			targetLabel = "";
			error = null;
		},

		/** Set an error message (keeps dialog open). */
		fail(message: string) {
			error = message;
		},
	};
}
