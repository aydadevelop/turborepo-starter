<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import { goto } from "$app/navigation";
	import { authClient } from "$lib/auth-client";

	const sessionQuery = authClient.useSession();

	async function handleSignOut() {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					goto("/");
				},
				onError: (error) => {
					console.error("Sign out failed:", error);
				},
			},
		});
	}

	function goToLogin() {
		goto("/login");
	}
</script>

<div class="relative">
	{#if $sessionQuery.isPending}
		<div class="h-8 w-24 animate-pulse rounded bg-muted"></div>
	{:else if $sessionQuery.data?.user}
		{@const user = $sessionQuery.data.user}
		<div class="flex items-center gap-3">
			<span
				class="text-sm text-muted-foreground hidden sm:inline"
				title={user.email}
			>
				{user.name || user.email?.split('@')[0] || 'User'}
			</span>
			<Button variant="destructive" size="sm" onclick={handleSignOut}>
				Sign Out
			</Button>
		</div>
	{:else}
		<div class="flex items-center gap-2">
			<Button size="sm" onclick={goToLogin}>Sign In</Button>
		</div>
	{/if}
</div>
