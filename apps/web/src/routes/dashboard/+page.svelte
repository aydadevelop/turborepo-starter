<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import * as Card from "@full-stack-cf-app/ui/components/card";
	import { createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { authClient } from "$lib/auth-client";
	import { orpc } from "$lib/orpc";

	let customerState = $state<{ activeSubscriptions?: unknown[] } | null>(null);
	let passkeyPending = $state(false);
	let passkeyMessage = $state<string | null>(null);
	let passkeyError = $state<string | null>(null);

	const sessionQuery = authClient.useSession();

	const privateDataQuery = createQuery(orpc.privateData.queryOptions());

	$effect(() => {
		if (!($sessionQuery.isPending || $sessionQuery.data)) {
			goto("/login");
		}
	});

	$effect(() => {
		if ($sessionQuery.data) {
			authClient.customer.state().then(({ data }) => {
				customerState = data;
			});
		}
	});

	const hasPro = $derived(
		(customerState?.activeSubscriptions?.length ?? 0) > 0
	);

	const registerPasskey = async () => {
		if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
			passkeyError = "Passkeys are not supported in this browser.";
			passkeyMessage = null;
			return;
		}

		const user = $sessionQuery.data?.user;
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
		} catch (error) {
			passkeyError =
				error instanceof Error ? error.message : "Failed to register passkey.";
		} finally {
			passkeyPending = false;
		}
	};
</script>

{#if $sessionQuery.isPending}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if !$sessionQuery.data}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Redirecting to login...</p>
	</div>
{:else}
	<div class="max-w-2xl mx-auto p-6 space-y-6">
		<h1 class="text-3xl font-bold">Dashboard</h1>

		<Card.Root>
			<Card.Header>
				<Card.Title>Welcome, {$sessionQuery.data.user.name}</Card.Title>
				<Card.Description>Your account overview</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">API Status</span>
					<span class="text-foreground">
						{$privateDataQuery.data?.message ?? "Loading..."}
					</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Plan</span>
					<span
						class={hasPro ? "text-primary font-semibold" : "text-foreground"}
					>
						{hasPro ? "Pro" : "Free"}
					</span>
				</div>
			</Card.Content>
			<Card.Footer>
				{#if hasPro}
					<Button
						variant="outline"
						onclick={async () => await authClient.customer.portal()}
					>
						Manage Subscription
					</Button>
				{:else}
					<Button
						onclick={async () => await authClient.checkout({ slug: "pro" })}
					>
						Upgrade to Pro
					</Button>
				{/if}
			</Card.Footer>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Passkey</Card.Title>
				<Card.Description>
					Register a passkey once, then sign in without password.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm text-muted-foreground">
				<p>Use Face ID, Touch ID, Windows Hello, or a hardware security key.</p>
				{#if passkeyMessage}
					<p class="text-primary">{passkeyMessage}</p>
				{/if}
				{#if passkeyError}
					<p class="text-destructive">{passkeyError}</p>
				{/if}
			</Card.Content>
			<Card.Footer>
				<Button
					variant="outline"
					onclick={() => void registerPasskey()}
					disabled={passkeyPending}
				>
					{passkeyPending ? "Registering..." : "Register Passkey"}
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>
{/if}
