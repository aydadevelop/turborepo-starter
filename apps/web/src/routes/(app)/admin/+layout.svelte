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

	const { children } = $props();
	const sessionQuery = authClient.useSession();
	const initialSession = $derived(getPageInitialSessionData(page.data));
	const sessionData = $derived(
		resolveSessionData($sessionQuery, initialSession)
	);
	const sessionPending = $derived(
		isSessionPending($sessionQuery, initialSession)
	);

	$effect(() => {
		if (sessionPending) return;
		const user = sessionData?.user;
		if (!hasAuthenticatedSession(sessionData)) {
			goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
			);
			return;
		}
		if ((user as { role?: string }).role !== "admin") {
			goto(resolve("/dashboard/settings"));
		}
	});

	const navItems = $derived([
		{ href: resolve("/admin"), label: "Overview" },
		{ href: resolve("/admin/organizations"), label: "Organizations" },
		{ href: resolve("/admin/users"), label: "Users" },
	]);

	const isActive = (href: string) => {
		if (href === resolve("/admin"))
			return page.url.pathname === resolve("/admin");
		return page.url.pathname.startsWith(href);
	};
</script>

{#if sessionPending}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if ((sessionData?.user as { role?: string } | undefined)?.role !== "admin")}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Access denied</p>
	</div>
{:else}
	<div class="mx-auto max-w-6xl px-6 py-6">
		<div class="mb-6">
			<h1 class="text-2xl font-bold">Admin</h1>
			<nav class="mt-3 flex gap-1 overflow-x-auto border-b">
				{#each navItems as item (item.href)}
					<a
						href={item.href}
						class="whitespace-nowrap px-3 py-2 text-sm transition
							{isActive(item.href)
							? 'border-b-2 border-primary font-medium text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
		{@render children()}
	</div>
{/if}
