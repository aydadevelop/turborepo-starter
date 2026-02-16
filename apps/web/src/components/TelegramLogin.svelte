<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import { onMount } from "svelte";
	import { authClient } from "$lib/auth-client";

	const { postAuthRedirectPath }: { postAuthRedirectPath: string } = $props();

	let error = $state<string | null>(null);
	let pending = $state(false);
	let widgetAvailable = $state(false);

	onMount(() => {
		authClient
			.getTelegramConfig()
			.then((config) => {
				if (!config.data?.botUsername) return;
				widgetAvailable = true;
				authClient.initTelegramWidget(
					"telegram-login-widget",
					{ size: "large", cornerRadius: 8, showUserPhoto: true },
					async (authData) => {
						pending = true;
						error = null;
						const result = await authClient.signInWithTelegram(authData);
						pending = false;
						if (result.error) {
							error = result.error.message || "Telegram sign in failed.";
							return;
						}
						window.location.href = postAuthRedirectPath;
					}
				);
			})
			.catch(() => {
				// Telegram plugin not configured on server — hide the widget
			});
	});
</script>

{#if widgetAvailable}
	<div class="flex flex-col items-center gap-2">
		<div id="telegram-login-widget"></div>
		{#if pending}
			<p class="text-sm text-muted-foreground">Signing in with Telegram...</p>
		{/if}
		{#if error}
			<p class="text-sm text-destructive" role="alert">{error}</p>
		{/if}
	</div>
{/if}
