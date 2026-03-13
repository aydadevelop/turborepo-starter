<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import type { OrganizationOverlaySummary } from "$lib/orpc-types";

	let { overlay }: { overlay: OrganizationOverlaySummary } = $props();
</script>

<Card>
	<CardHeader class="pb-2">
		<CardDescription>Operator blockers</CardDescription>
		<CardTitle class="text-base">
			{overlay.blockers.totalBlockingIssues}
		</CardTitle>
	</CardHeader>
	<CardContent class="space-y-1 text-sm text-muted-foreground">
		<p>Missing pricing: {overlay.blockers.missingPricingCount}</p>
		<p>Missing calendar: {overlay.blockers.missingCalendarCount}</p>
		<p>Missing primary image: {overlay.blockers.missingPrimaryImageCount}</p>
		<p>Missing location: {overlay.blockers.missingLocationCount}</p>
	</CardContent>
</Card>
