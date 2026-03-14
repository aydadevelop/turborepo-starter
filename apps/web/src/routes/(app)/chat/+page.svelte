<script lang="ts">
	import type { CreateMutationResult } from "@tanstack/svelte-query";
	import { getContext } from "svelte";
	import ChatEmptyStateScreen from "../../../features/chat/ChatEmptyStateScreen.svelte";

	const createChat =
		getContext<
			CreateMutationResult<{ id: string; title: string }, Error, string>
		>("createChatMutation");
</script>

<ChatEmptyStateScreen
	creating={createChat.isPending}
	onCreateChat={() => createChat.mutate("New Chat")}
/>
