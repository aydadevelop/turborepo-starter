<script lang="ts">
	import { cn } from "@my-app/ui/lib/utils";
	import { watch } from "runed";
	import { untrack } from "svelte";
	import {
		type InitialMode,
		type ResizeMode,
		setChatContainerContext,
	} from "./chat-container-context.svelte";

	let {
		children,
		class: className,
		resize = "smooth",
		initial = "instant",
		...restProps
	}: {
		children?: import("svelte").Snippet;
		class?: string;
		resize?: ResizeMode;
		initial?: InitialMode;
		[key: string]: unknown;
	} = $props();

	const context = setChatContainerContext(
		untrack(() => resize),
		untrack(() => initial)
	);

	let containerElement: HTMLElement | null = null;

	watch(
		() => containerElement,
		() => {
			if (containerElement) {
				context.setElement(containerElement);
			}
		}
	);
</script>

<div
	bind:this={containerElement}
	class={cn("flex overflow-y-auto", className)}
	role="log"
	{...restProps}
>
	{@render children?.()}
</div>
