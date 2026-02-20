<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { authClient } from "$lib/auth-client";

	const { postAuthRedirectPath }: { postAuthRedirectPath: string } = $props();

	const containerId = "telegram-login-widget";

	onMount(() => {
		authClient
			.initTelegramWidget(
				containerId,
				{ size: "medium", showUserPhoto: false },
				async (authData) => {
					const { error } = await authClient.signInWithTelegram(authData);
					if (!error) {
						goto(postAuthRedirectPath);
					}
				}
			)
			.catch((err: unknown) => {
				console.error("Failed to initialize Telegram widget", err);
			});
	});
</script>

<div id={containerId}></div>
