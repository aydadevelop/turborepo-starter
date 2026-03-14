<script lang="ts">
	let {
		href,
		label,
		dataTestId = undefined,
	}: {
		href: string;
		label: string;
		dataTestId?: string;
	} = $props();
</script>

<a {href} class="text-sm text-primary hover:underline" data-testid={dataTestId}>
	{label}
</a>
