<script lang="ts">
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import {
		type ButtonVariant,
		buttonVariants,
	} from "@my-app/ui/components/button";
	import { cn } from "@my-app/ui/lib/utils";
	import { Calendar as CalendarPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		children,
		variant = "ghost",
		...restProps
	}: CalendarPrimitive.NextButtonProps & {
		variant?: ButtonVariant;
	} = $props();
</script>

{#snippet Fallback()}
	<ChevronRightIcon class="size-4" />
{/snippet}

<CalendarPrimitive.NextButton
	bind:ref
	class={cn(
		buttonVariants({ variant }),
		"size-(--cell-size) bg-transparent p-0 select-none disabled:opacity-50 rtl:rotate-180",
		className
	)}
	children={children || Fallback}
	{...restProps}
/>
