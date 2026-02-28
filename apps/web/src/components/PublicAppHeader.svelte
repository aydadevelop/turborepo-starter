<script lang="ts">
	import { QueryClientProvider } from "@tanstack/svelte-query";
	import { queryClient } from "$lib/orpc";
	import Header from "./Header.svelte";
</script>

<QueryClientProvider client={queryClient}> <Header /> </QueryClientProvider>
