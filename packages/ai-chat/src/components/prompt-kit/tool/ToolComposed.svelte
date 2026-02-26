<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { Tool, ToolContent, ToolDetails, ToolHeader } from "./index.js";
	import type { ToolPart } from "./types.js";

	let {
		toolPart,
		defaultOpen = false,
		class: className,
		onApprove,
		onDeny,
	}: {
		toolPart: ToolPart;
		defaultOpen?: boolean;
		class?: string;
		onApprove?: (approvalId: string) => void;
		onDeny?: (approvalId: string) => void;
	} = $props();
</script>

<Tool {toolPart} {defaultOpen} class={className}>
	{#snippet children(toolPart)}
		<ToolHeader {toolPart} />
		{#if toolPart.state === "approval-requested" && toolPart.approval}
			<div class="border-t px-3 py-2 flex items-center gap-2">
				<span class="text-sm text-muted-foreground flex-1"
					>Allow this action?</span
				>
				<Button
					size="sm"
					variant="default"
					onclick={() => onApprove?.(toolPart.approval!.id)}
				>
					Approve
				</Button>
				<Button
					size="sm"
					variant="outline"
					onclick={() => onDeny?.(toolPart.approval!.id)}
				>
					Deny
				</Button>
			</div>
		{/if}
		<ToolContent> <ToolDetails {toolPart} /> </ToolContent>
	{/snippet}
</Tool>
