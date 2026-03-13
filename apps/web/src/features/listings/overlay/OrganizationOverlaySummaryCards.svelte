<script lang="ts">
	import {
		Card,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import type { OrganizationOverlaySummary } from "$lib/orpc-types";

	let { overlay }: { overlay: OrganizationOverlaySummary } = $props();
</script>

<div class="grid gap-4 md:grid-cols-4">
	<Card>
		<CardHeader class="pb-2">
			<CardDescription>Total listings</CardDescription>
			<CardTitle class="text-2xl">
				{overlay.publishing.totalListingCount}
			</CardTitle>
		</CardHeader>
	</Card>
	<Card>
		<CardHeader class="pb-2">
			<CardDescription>Published</CardDescription>
			<CardTitle class="text-2xl">
				{overlay.publishing.publishedListingCount}
			</CardTitle>
		</CardHeader>
	</Card>
	<Card>
		<CardHeader class="pb-2">
			<CardDescription>Drafts</CardDescription>
			<CardTitle class="text-2xl">
				{overlay.publishing.draftListingCount}
			</CardTitle>
		</CardHeader>
	</Card>
	<Card>
		<CardHeader class="pb-2">
			<CardDescription>Pending review</CardDescription>
			<CardTitle class="text-2xl">
				{overlay.publishing.reviewPendingCount}
			</CardTitle>
		</CardHeader>
	</Card>
</div>
