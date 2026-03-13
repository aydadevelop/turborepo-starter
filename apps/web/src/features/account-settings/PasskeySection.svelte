<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { authClient } from "$lib/auth-client";
	import AccountSettingsSection from "./AccountSettingsSection.svelte";

	type UserProfile = {
		name?: string | null;
		email?: string | null;
	};

	let { user }: { user: UserProfile | null | undefined } = $props();

	let passkeyPending = $state(false);
	let passkeyMessage = $state<string | null>(null);
	let passkeyError = $state<string | null>(null);

	const registerPasskey = async () => {
		if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
			passkeyError = "Passkeys are not supported in this browser.";
			passkeyMessage = null;
			return;
		}

		if (!user) {
			passkeyError = "You must be signed in to register a passkey.";
			passkeyMessage = null;
			return;
		}

		passkeyPending = true;
		passkeyError = null;
		passkeyMessage = null;
		try {
			const { error } = await authClient.passkey.addPasskey({
				name: user.email ?? user.name ?? "My passkey",
			});

			if (error) {
				passkeyError = error.message || "Failed to register passkey.";
				return;
			}

			passkeyMessage = "Passkey registered. You can sign in using passkey now.";
		} catch (err) {
			passkeyError =
				err instanceof Error ? err.message : "Failed to register passkey.";
		} finally {
			passkeyPending = false;
		}
	};
</script>

<AccountSettingsSection
	title="Passkey"
	description="Register a passkey to sign in without a password using Face ID, Touch ID, Windows Hello, or a hardware security key."
>
	{#snippet children()}
		<div class="space-y-3 text-sm text-muted-foreground">
			{#if passkeyMessage}
				<p class="text-primary">{passkeyMessage}</p>
			{/if}
			{#if passkeyError}
				<p class="text-destructive">{passkeyError}</p>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<Button
			variant="outline"
			onclick={() => void registerPasskey()}
			disabled={passkeyPending}
		>
			{passkeyPending ? "Registering..." : "Register Passkey"}
		</Button>
	{/snippet}
</AccountSettingsSection>
