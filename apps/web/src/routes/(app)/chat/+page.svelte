<script lang="ts">
	import ChatEmptyStateScreen from "../../../features/chat/ChatEmptyStateScreen.svelte";
	import type { CreateMutationResult } from "@tanstack/svelte-query";
	import { getContext } from "svelte";

	const createChat =
		getContext<
			CreateMutationResult<{ id: string; title: string }, Error, string>
		>("createChatMutation");
</script>

<ChatEmptyStateScreen
	creating={createChat.isPending}
	onCreateChat={() => createChat.mutate("New Chat")}
/>
