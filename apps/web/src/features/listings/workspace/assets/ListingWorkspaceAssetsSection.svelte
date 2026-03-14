<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";

	import type { ListingAssetWorkspaceState } from "$lib/orpc-types";

	let { assets = null }: { assets?: ListingAssetWorkspaceState | null } =
		$props();
</script>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Assets workspace</CardTitle>
		<CardDescription>
			Images and documents that shape the customer-facing listing.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		<div class="grid gap-4 md:grid-cols-3">
			<div class="rounded-lg border p-3 text-sm">
				<p class="font-medium">Total assets</p>
				<p class="text-muted-foreground">{assets?.totalCount ?? 0}</p>
			</div>
			<div class="rounded-lg border p-3 text-sm">
				<p class="font-medium">Images</p>
				<p class="text-muted-foreground">{assets?.imageCount ?? 0}</p>
			</div>
			<div class="rounded-lg border p-3 text-sm">
				<p class="font-medium">Documents</p>
				<p class="text-muted-foreground">{assets?.documentCount ?? 0}</p>
			</div>
		</div>
		{#if assets?.items.length}
			<div class="space-y-3">
				{#each assets.items as item (item.id)}
					<div class="rounded-lg border p-3">
						<div class="flex items-center justify-between gap-3">
							<div>
								<p class="font-medium">{item.kind}</p>
								<p class="text-sm text-muted-foreground">
									{item.storageProvider}
									· {item.storageKey}
								</p>
							</div>
							{#if item.isPrimary}
								<Badge variant="outline">Primary</Badge>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No listing assets yet.</p>
		{/if}
	</CardContent>
</Card>
