<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import {
		hasAuthenticatedSession,
		isSessionPending,
		resolveSessionData,
		type AuthSessionData,
	} from "$lib/auth-session";
	import { queryClient } from "$lib/orpc";

	let {
		pendingInvitationCount = 0,
		sessionQuery,
		initialSession = undefined,
	}: {
		pendingInvitationCount?: number;
		sessionQuery: ReturnType<typeof authClient.useSession>;
		initialSession?: AuthSessionData | null;
	} = $props();

	const sessionData = $derived(
		resolveSessionData($sessionQuery, initialSession)
	);
	const sessionPending = $derived(isSessionPending($sessionQuery, initialSession));
	const hasSessionUser = $derived(
		Boolean(sessionData?.session && sessionData?.user?.id)
	);
	const isFullyAuthenticated = $derived(
		hasAuthenticatedSession(sessionData)
	);

	async function handleSignOut() {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					queryClient.clear();
					window.location.href = resolve("/");
				},
				onError: (error) => {
					console.error("Sign out failed:", error);
				},
			},
		});
	}

	const loginHref = $derived(
		`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
	);
</script>

<div class="relative">
	{#if sessionPending}
		<div class="h-8 w-24 animate-pulse rounded bg-muted"></div>
	{:else if hasSessionUser}
		{@const user = sessionData?.user}
		<div class="flex items-center gap-3">
			<span
				class="text-sm text-muted-foreground hidden sm:inline"
				title={user?.email}
			>
				{user?.name || user?.email?.split('@')[0] || 'Anonymous'}
			</span>
			{#if isFullyAuthenticated}
				<a
					href={resolve("/dashboard/settings")}
					class="relative text-sm text-muted-foreground transition hover:text-foreground"
				>
					Settings
					{#if pendingInvitationCount > 0}
						<Badge
							variant="destructive"
							class="absolute -right-5 -top-2 h-5 min-w-5 px-1 text-xs"
						>
							{pendingInvitationCount}
						</Badge>
					{/if}
				</a>
			{/if}
			<Button
				variant="destructive"
				size="sm"
				onclick={handleSignOut}
				data-testid="sign-out-button"
			>
				Sign Out
			</Button>
		</div>
	{:else}
		<div class="flex items-center gap-2">
			<Button size="sm" href={loginHref} data-testid="header-sign-in-button">
				Sign In
			</Button>
		</div>
	{/if}
</div>
