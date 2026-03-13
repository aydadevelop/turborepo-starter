<script lang="ts">
	import { Label } from "@my-app/ui/components/label";
	import type { Snippet } from "svelte";

	let {
		id,
		label,
		description = null,
		errors = [],
		showErrors = false,
		children,
	}: {
		id: string;
		label: string;
		description?: string | null;
		errors?: string[];
		showErrors?: boolean;
		children?: Snippet;
	} = $props();
</script>

<div class="space-y-2">
	<Label for={id}>{label}</Label>
	{#if children}
		{@render children()}
	{/if}
	{#if description}
		<p class="text-xs text-muted-foreground">{description}</p>
	{/if}
	{#if showErrors}
		{#each errors as message}
			<p class="text-sm text-destructive" role="alert">{message}</p>
		{/each}
	{/if}
</div>
