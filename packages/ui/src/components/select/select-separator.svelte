<script lang="ts">
	import { Separator } from "@full-stack-cf-app/ui/components/separator";
	import { cn } from "@full-stack-cf-app/ui/lib/utils";
	import type { Separator as SeparatorPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SeparatorPrimitive.RootProps = $props();
</script>

<Separator
	bind:ref
	data-slot="select-separator"
	class={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
	{...restProps}
/>
