<script lang="ts">
	import { Button } from "@my-app/ui/components/button";

	let {
		currentPage,
		totalPages,
		totalItems,
		itemLabel = "items",
		onPrevious,
		onNext,
		previousDisabled = false,
		nextDisabled = false,
	}: {
		currentPage: number;
		totalPages: number;
		totalItems: number;
		itemLabel?: string;
		onPrevious: () => void;
		onNext: () => void;
		previousDisabled?: boolean;
		nextDisabled?: boolean;
	} = $props();
</script>

<div class="flex items-center justify-between">
	<p class="text-sm text-muted-foreground">
		Page {currentPage} of {totalPages} ({totalItems} {itemLabel})
	</p>
	<div class="flex gap-2">
		<Button
			variant="outline"
			size="sm"
			disabled={previousDisabled}
			onclick={onPrevious}
		>
			Previous
		</Button>
		<Button
			variant="outline"
			size="sm"
			disabled={nextDisabled}
			onclick={onNext}
		>
			Next
		</Button>
	</div>
</div>
