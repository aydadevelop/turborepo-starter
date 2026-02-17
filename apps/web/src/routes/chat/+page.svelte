<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import MessageSquarePlus from "@lucide/svelte/icons/message-square-plus";
	import type { CreateMutationResult } from "@tanstack/svelte-query";
	import { getContext } from "svelte";

	const createChatMutation =
		getContext<
			CreateMutationResult<{ id: string; title: string }, Error, string>
		>("createChatMutation");
</script>

<div class="flex h-full flex-col items-center justify-center gap-4 p-8">
	<h1 class="text-2xl font-bold">Boat Booking Assistant</h1>
	<p class="text-muted-foreground">
		Select a chat from the sidebar or start a new one.
	</p>
	<Button
		onclick={() => $createChatMutation.mutate("New Chat")}
		disabled={$createChatMutation.isPending}
	>
		<MessageSquarePlus class="mr-2 h-4 w-4" />
		New Chat
	</Button>
</div>
