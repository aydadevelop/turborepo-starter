<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import {
		Content as DialogContent,
		Description as DialogDescription,
		Footer as DialogFooter,
		Header as DialogHeader,
		Root as DialogRoot,
		Title as DialogTitle,
	} from "@my-app/ui/components/dialog";
	import type { Snippet } from "svelte";

	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel = "Confirm",
		pendingLabel = "Working...",
		cancelLabel = "Cancel",
		confirmDisabled = false,
		pending = false,
		variant = "destructive",
		errorMessage = null,
		onConfirm,
		children,
	}: {
		open?: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		pendingLabel?: string;
		cancelLabel?: string;
		confirmDisabled?: boolean;
		pending?: boolean;
		variant?:
			| "default"
			| "outline"
			| "destructive"
			| "secondary"
			| "ghost"
			| "link";
		errorMessage?: string | null;
		onConfirm?: () => void | Promise<void>;
		children?: Snippet;
	} = $props();
</script>

<DialogRoot bind:open>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>{title}</DialogTitle>
			{#if description}
				<DialogDescription>{description}</DialogDescription>
			{/if}
		</DialogHeader>
		{#if children}
			<div class="space-y-3 py-2">{@render children()}</div>
		{/if}
		{#if errorMessage}
			<p class="text-sm text-destructive">{errorMessage}</p>
		{/if}
		<DialogFooter>
			<Button variant="outline" onclick={() => (open = false)}>
				{cancelLabel}
			</Button>
			<Button
				{variant}
				disabled={confirmDisabled || pending}
				onclick={() => void onConfirm?.()}
			>
				{pending ? pendingLabel : confirmLabel}
			</Button>
		</DialogFooter>
	</DialogContent>
</DialogRoot>
