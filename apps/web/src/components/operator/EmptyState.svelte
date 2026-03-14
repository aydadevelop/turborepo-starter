<script lang="ts">
	import { cn } from "@my-app/ui/lib/utils";
	import type { Snippet } from "svelte";

	let {
		title,
		description,
		icon,
		action,
		class: className = "",
	}: {
		title: string;
		description?: string;
		icon?: Snippet;
		action?: Snippet;
		class?: string;
	} = $props();
</script>

<div
	class={cn("flex flex-col items-center justify-center gap-3 py-12 text-center", className)}
>
	{#if icon}
		<div class="text-muted-foreground">{@render icon()}</div>
	{/if}
	<div class="space-y-1">
		<p class="text-sm font-medium text-foreground">{title}</p>
		{#if description}
			<p class="text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if action}
		<div class="mt-2">{@render action()}</div>
	{/if}
</div>
