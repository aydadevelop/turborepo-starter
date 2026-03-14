<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import type { OrganizationOverlaySummary } from "$lib/orpc-types";

	let { overlay }: { overlay: OrganizationOverlaySummary } = $props();
</script>

<div class="rounded-lg border bg-card p-4 text-sm">
	<div
		class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
	>
		<div class="space-y-1">
			<p class="font-medium">Organization readiness</p>
			<p class="text-muted-foreground">
				Payment, calendar, and publication readiness are tracked in the
				organization overlay.
			</p>
		</div>
		<Badge variant={overlay.onboarding.isComplete ? "default" : "secondary"}>
			{overlay.onboarding.isComplete ? "Ready" : "Setup incomplete"}
		</Badge>
	</div>
</div>
