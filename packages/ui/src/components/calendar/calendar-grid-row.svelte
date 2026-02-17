<script lang="ts">
	import { cn } from "@full-stack-cf-app/ui/lib/utils";
	import { Calendar as CalendarPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CalendarPrimitive.GridRowProps = $props();
</script>

<CalendarPrimitive.GridRow
	bind:ref
	class={cn("flex", className)}
	{...restProps}
/>
