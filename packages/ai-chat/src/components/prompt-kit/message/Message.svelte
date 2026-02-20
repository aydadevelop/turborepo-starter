<script lang="ts">
	import { cn } from "@my-app/ui/lib/utils";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { MessageClass, setMessageContext } from "./message-context.svelte.js";

	let {
		class: className,
		children,
		...restProps
	}: {
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	const contextInstance = new MessageClass();
	setMessageContext(contextInstance);
</script>

<div class={cn("flex gap-3", className)} {...restProps}>
	{@render children()}
</div>
