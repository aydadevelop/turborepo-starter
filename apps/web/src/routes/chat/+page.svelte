<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import MessageSquarePlus from "@lucide/svelte/icons/message-square-plus";
	import { createMutation, useQueryClient } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { assistantClient } from "$lib/assistant";
	import { authClient } from "$lib/auth-client";

	const queryClient = useQueryClient();
	const sessionQuery = authClient.useSession();

	const createChatMutation = createMutation({
		async mutationFn(title: string) {
			if (!$sessionQuery.data) {
				await authClient.signIn.anonymous();
			}
			return assistantClient.createChat({ title });
		},
		onSuccess(data) {
			queryClient.invalidateQueries({ queryKey: ["assistant", "chats"] });
			goto(resolve(`/chat/${data.id}`));
		},
	});
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
