<script lang="ts">
	import { Button } from "@my-app/ui/components/button";

	let {
		pending = false,
		disabled = false,
		dataTestId = undefined,
		onImpersonate,
	}: {
		pending?: boolean;
		disabled?: boolean;
		dataTestId?: string;
		onImpersonate: () => void;
	} = $props();
</script>

<Button
	variant="outline"
	size="sm"
	disabled={pending || disabled}
	data-testid={dataTestId}
	onclick={onImpersonate}
>
	{pending ? "Impersonating..." : "Impersonate"}
</Button>
