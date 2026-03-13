<script lang="ts">
	import { Button, type ButtonVariant } from "@my-app/ui/components/button";
	import {
		Content as DialogContent,
		Description as DialogDescription,
		Header as DialogHeader,
		Root as DialogRoot,
		Title as DialogTitle,
	} from "@my-app/ui/components/dialog";
	import type { Snippet } from "svelte";

	let {
		open = $bindable(false),
		title,
		description,
		triggerLabel,
		triggerVariant = "outline",
		triggerDisabled = false,
		children,
	}: {
		children: Snippet;
		description?: string;
		open?: boolean;
		title: string;
		triggerDisabled?: boolean;
		triggerLabel: string;
		triggerVariant?: ButtonVariant;
	} = $props();
</script>

<Button
	variant={triggerVariant}
	disabled={triggerDisabled}
	onclick={() => {
		open = true;
	}}
>
	{triggerLabel}
</Button>

<DialogRoot bind:open>
	<DialogContent class="sm:max-w-2xl">
		<DialogHeader>
			<DialogTitle>{title}</DialogTitle>
			{#if description}
				<DialogDescription>{description}</DialogDescription>
			{/if}
		</DialogHeader>

		<div class="space-y-4 py-2">
			{@render children()}
		</div>
	</DialogContent>
</DialogRoot>
