<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import { hasAuthenticatedSession } from "$lib/auth-session";
	import SignInForm from "../../components/SignInForm.svelte";
	import SignUpForm from "../../components/SignUpForm.svelte";

	const sessionQuery = authClient.useSession();
	let showSignIn = $state(true);
	const showAuthForms = $derived(
		!($sessionQuery.isPending || hasAuthenticatedSession($sessionQuery.data))
	);

	const resolvePostAuthRedirect = (candidatePath: string | null): string => {
		if (!candidatePath) {
			return resolve("/dashboard/settings");
		}
		if (!candidatePath.startsWith("/") || candidatePath.startsWith("//")) {
			return resolve("/dashboard/settings");
		}
		return candidatePath;
	};

	$effect(() => {
		if ($sessionQuery.isPending) {
			return;
		}

		if (!hasAuthenticatedSession($sessionQuery.data)) {
			return;
		}

		goto(resolvePostAuthRedirect(page.url.searchParams.get("next")));
	});
</script>

{#if showAuthForms}
	{#if showSignIn}
		<SignInForm switchToSignUp={() => showSignIn = false} />
	{:else}
		<SignUpForm switchToSignIn={() => showSignIn = true} />
	{/if}
{/if}
