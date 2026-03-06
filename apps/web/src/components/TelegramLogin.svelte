<script lang="ts">
	import { onMount, tick } from "svelte";
	import { goto } from "$app/navigation";
	import { authClient } from "$lib/auth-client";

	const { postAuthRedirectPath }: { postAuthRedirectPath: string } = $props();

	const containerId = "telegram-login-widget";
	const LOCAL_TELEGRAM_UNSUPPORTED_HOSTS = new Set(["127.0.0.1", "localhost"]);
	let isTelegramAvailable = $state(false);

	onMount(() => {
		if (LOCAL_TELEGRAM_UNSUPPORTED_HOSTS.has(window.location.hostname)) {
			isTelegramAvailable = false;
			return;
		}

		authClient
			.getTelegramConfig()
			.then(async ({ data }) => {
				if (!data?.botUsername) {
					isTelegramAvailable = false;
					return;
				}

				isTelegramAvailable = true;
				await tick();
				await authClient.initTelegramWidget(
					containerId,
					{ size: "medium", showUserPhoto: false },
					async (authData) => {
						const { error } = await authClient.signInWithTelegram(authData);
						if (!error) {
							goto(postAuthRedirectPath);
						}
					}
				);
			})
			.catch((err: unknown) => {
				console.error("Failed to initialize Telegram widget", err);
			});
	});
</script>

{#if isTelegramAvailable}
	<div id={containerId}></div>
{/if}
