<script lang="ts">
	import { page } from "$app/state";
	import ChatConversationScreen from "../../../../features/chat/ChatConversationScreen.svelte";
</script>

<ChatConversationScreen chatId={page.params.id ?? ""} />
