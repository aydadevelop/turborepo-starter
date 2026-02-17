<script lang="ts">
	import { Collapsible } from "@full-stack-cf-app/ui/components/collapsible";
	import { cn } from "@full-stack-cf-app/ui/lib/utils";
	import type { Snippet } from "svelte";
	import type { ToolPart } from "./types.js";

	let {
		toolPart,
		defaultOpen = false,
		open = $bindable(defaultOpen),
		class: className,
		children,
	}: {
		toolPart: ToolPart;
		defaultOpen?: boolean;
		open?: boolean;
		class?: string;
		children: Snippet<[ToolPart]>;
	} = $props();
</script>

<Collapsible
	bind:open
	class={cn("border-border mt-3 overflow-hidden rounded-lg border", className)}
>
	{@render children(toolPart)}
</Collapsible>
