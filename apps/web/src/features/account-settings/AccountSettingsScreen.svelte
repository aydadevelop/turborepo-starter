<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import {
		getPageInitialSessionData,
		hasAuthenticatedSession,
		isSessionPending,
		resolveSessionData,
	} from "$lib/auth-session";
	import InvitationsSection from "./InvitationsSection.svelte";
	import LinkedAccountsSection from "./LinkedAccountsSection.svelte";
	import OrganizationsSection from "./OrganizationsSection.svelte";
	import PasskeySection from "./PasskeySection.svelte";
	import ProfileSection from "./ProfileSection.svelte";

	const sessionQuery = authClient.useSession();
	const initialSession = $derived(getPageInitialSessionData(page.data));
	const sessionData = $derived(
		resolveSessionData($sessionQuery, initialSession),
	);
	const sessionPending = $derived(
		isSessionPending($sessionQuery, initialSession),
	);

	$effect(() => {
		if (sessionPending) return;
		if (!hasAuthenticatedSession(sessionData)) {
			goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`,
			);
		}
	});

	const user = $derived(sessionData?.user);
	const phoneNumber = $derived(
		(user as { phoneNumber?: string } | undefined)?.phoneNumber ?? null,
	);
	const telegramUsername = $derived(
		(user as { telegramUsername?: string } | undefined)?.telegramUsername ??
			null,
	);
</script>

{#if sessionPending}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if !hasAuthenticatedSession(sessionData)}
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
			enabled={hasAuthenticatedSession(sessionData)}
		/>
		<PasskeySection {user} />
		<InvitationsSection enabled={hasAuthenticatedSession(sessionData)} />
		<OrganizationsSection />
	</div>
{/if}
