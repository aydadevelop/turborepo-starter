<script lang="ts">
	import {
		Content as DialogContent,
		Description as DialogDescription,
		Header as DialogHeader,
		Root as DialogRoot,
		Title as DialogTitle,
	} from "@my-app/ui/components/dialog";
	import { cn } from "@my-app/ui/lib/utils";
	import type { Snippet } from "svelte";

	/**
	 * EditDrawer — convention: use for **edit** flows.
	 *
	 * Renders a right-anchored panel (drawer) using the Dialog primitive
	 * with slide-in animation. Since the UI library does not ship a Sheet
	 * component, we override Dialog content positioning to achieve a drawer.
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
	<DialogContent
		class={cn(
			"fixed inset-y-0 right-0 left-auto top-0 h-full w-full translate-x-0 translate-y-0 rounded-none border-l sm:max-w-md",
			"data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
			"data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
			className,
		)}
	>
		<DialogHeader>
			<DialogTitle>{title}</DialogTitle>
			{#if description}
				<DialogDescription>{description}</DialogDescription>
			{/if}
		</DialogHeader>

		<div class="flex-1 overflow-y-auto space-y-4 py-2">
			{@render children()}
		</div>

		{#if footer}
			<div class="border-t pt-4 flex justify-end gap-2">{@render footer()}</div>
		{/if}
	</DialogContent>
</DialogRoot>
