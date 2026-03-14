<script lang="ts">
	import {
		Content as DialogContent,
		Description as DialogDescription,
		Footer as DialogFooter,
		Header as DialogHeader,
		Root as DialogRoot,
		Title as DialogTitle,
	} from "@my-app/ui/components/dialog";
	import type { Snippet } from "svelte";

	/**
	 * FocusModal — convention: use for **create** flows.
	 *
	 * Renders a large centered dialog (sm:max-w-2xl) with title,
	 * optional description, body, and optional footer.
	 *
	 * Convention map:
	 *   FocusModal  → create
	 *   EditDrawer  → edit
	 *   ConfirmActionDialog → confirm / destroy
	 */
	let {
		open = $bindable(false),
		title,
		description,
		children,
		footer,
		class: className = "",
	}: {
		open?: boolean;
		title: string;
		description?: string;
		children: Snippet;
		footer?: Snippet;
		class?: string;
	} = $props();
</script>

<DialogRoot bind:open>
	<DialogContent class="sm:max-w-2xl {className}">
		<DialogHeader>
			<DialogTitle>{title}</DialogTitle>
			{#if description}
				<DialogDescription>{description}</DialogDescription>
			{/if}
		</DialogHeader>

		<div class="space-y-4 py-2">{@render children()}</div>

		{#if footer}
			<DialogFooter> {@render footer()} </DialogFooter>
		{/if}
	</DialogContent>
</DialogRoot>
