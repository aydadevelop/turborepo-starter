<script lang="ts">
	import { page } from "$app/state";
	import ListingWorkspaceScreen from "../../../../../features/listings/workspace/ListingWorkspaceScreen.svelte";

	const listingId = $derived(page.params.id ?? "");
</script>

<svelte:head>
	<title>Edit listing</title>
</svelte:head>

<ListingWorkspaceScreen {listingId} />
