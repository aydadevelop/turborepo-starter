<script lang="ts">
	import { CollapsibleContent } from "@full-stack-cf-app/ui/components/collapsible";
	import { cn } from "@full-stack-cf-app/ui/lib/utils";
	import type { Snippet } from "svelte";

	let {
		class: className,
		children,
	}: {
		class?: string;
		children: Snippet;
	} = $props();
</script>

<CollapsibleContent
	class={cn(
		"border-border border-t",
		"data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden",
		className
	)}
>
	{@render children()}
</CollapsibleContent>
