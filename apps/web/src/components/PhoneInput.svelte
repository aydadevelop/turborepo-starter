<script lang="ts">
	import { cn } from "@my-app/ui/lib/utils";
	import { maska } from "$lib/mask/action";

	const PHONE_MASK = "+7 (###) ###-##-##";

	interface Props {
		class?: string;
		disabled?: boolean;
		placeholder?: string;
		unmasked?: string;
		value?: string;
	}

	let {
		value = $bindable(""),
		unmasked = $bindable(""),
		disabled = false,
		class: className,
		placeholder = "+7 (___) ___-__-__",
	}: Props = $props();
</script>

<input
	type="tel"
	use:maska={{
		mask: PHONE_MASK,
		onMaska: (detail) => {
			value = detail.masked;
			unmasked = detail.unmasked;
		},
	}}
	{value}
	{disabled}
	{placeholder}
	class={cn(
		"border-input bg-background selection:bg-primary dark:bg-input/30 selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
		"focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
		"aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
		className
	)}
>
