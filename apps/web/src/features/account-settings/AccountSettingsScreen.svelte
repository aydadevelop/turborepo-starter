<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import { hasAuthenticatedSession } from "$lib/auth-session";
	import InvitationsSection from "./InvitationsSection.svelte";
	import LinkedAccountsSection from "./LinkedAccountsSection.svelte";
	import OrganizationsSection from "./OrganizationsSection.svelte";
	import PasskeySection from "./PasskeySection.svelte";
	import ProfileSection from "./ProfileSection.svelte";

	const sessionQuery = authClient.useSession();

	$effect(() => {
		if ($sessionQuery.isPending) return;
		if (!hasAuthenticatedSession($sessionQuery.data)) {
			goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
			);
		}
	});

	const user = $derived($sessionQuery.data?.user);
	const phoneNumber = $derived(
		(user as { phoneNumber?: string } | undefined)?.phoneNumber ?? null
	);
	const telegramUsername = $derived(
		(user as { telegramUsername?: string } | undefined)?.telegramUsername ??
			null
	);
</script>

{#if $sessionQuery.isPending}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if !hasAuthenticatedSession($sessionQuery.data)}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Redirecting to login...</p>
	</div>
{:else}
	<div class="max-w-2xl mx-auto p-6 space-y-4">
		<h1 class="text-3xl font-bold" data-testid="account-settings-heading">
			Account Settings
		</h1>
		<ProfileSection {user} {phoneNumber} />
		<LinkedAccountsSection
			user={{ phoneNumber, telegramUsername }}
			enabled={hasAuthenticatedSession($sessionQuery.data)}
		/>
		<PasskeySection {user} />
		<InvitationsSection enabled={hasAuthenticatedSession($sessionQuery.data)} />
		<OrganizationsSection />
	</div>
{/if}
