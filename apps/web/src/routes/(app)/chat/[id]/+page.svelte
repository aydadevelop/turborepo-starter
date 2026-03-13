<script lang="ts">
	import ChatConversationScreen from "../../../../features/chat/ChatConversationScreen.svelte";
	import { page } from "$app/state";
</script>

<ChatConversationScreen chatId={page.params.id ?? ""} />
