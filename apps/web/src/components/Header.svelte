<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { derived } from "svelte/store";
	import { resolve } from "$app/paths";
	import { authClient } from "$lib/auth-client";
	import { hasAuthenticatedSession } from "$lib/auth-session";
	import { orpc, queryClient } from "$lib/orpc";
	import NotificationCenter from "./NotificationCenter.svelte";
	import OrgSwitcher from "./OrgSwitcher.svelte";
	import UserMenu from "./UserMenu.svelte";

	// Stable constant — resolve() depends only on BASE_PATH (build-time),
	// so these never need to be recreated. Hoisting out of $derived avoids
	// giving the {#each} block a new array reference on every session tick.
	const STATIC_LINKS = [
		// { to: resolve("/"), label: "Home" },
		{ to: resolve("/chat"), label: "Chat" },
	] as const;

	// Stable queryFn — hoisted outside derived() so the function reference
	// doesn't change on every session store emission.
	const fetchUserInvitations = async () => {
		const { data, error } = await authClient.organization.listUserInvitations();
		if (error) throw error;
		return data ?? [];
	};

	const sessionQuery = authClient.useSession();

	const isImpersonating = $derived(
		Boolean(
			($sessionQuery.data?.session as { impersonatedBy?: string } | undefined)
				?.impersonatedBy
		)
	);

	const handleStopImpersonating = async () => {
		await authClient.admin.stopImpersonating();
		queryClient.invalidateQueries();
		window.location.href = resolve("/admin/users");
	};

	const canManageQueryOptions = derived(sessionQuery, ($sessionQuery) => ({
		...orpc.canManageOrganization.queryOptions(),
		retry: false,
		enabled: hasAuthenticatedSession($sessionQuery.data),
	}));
	const canManageQuery = createQuery(canManageQueryOptions);

	const invitationsQueryOptions = derived(sessionQuery, ($sessionQuery) => ({
		queryKey: ["user-invitations"],
		queryFn: fetchUserInvitations, // stable reference — no new closure per tick
		retry: false,
		enabled: hasAuthenticatedSession($sessionQuery.data),
	}));
	const invitationsQuery = createQuery(invitationsQueryOptions);

	const isAdmin = $derived(
		($sessionQuery.data?.user as { role?: string } | undefined)?.role ===
			"admin"
	);
	const hasOrgAccess = $derived(
		Boolean($canManageQuery.data?.canManageOrganization)
	);
	const pendingInvitationCount = $derived(
		($invitationsQuery.data ?? []).filter((inv) => inv.status === "pending")
			.length
	);
</script>

<header
	data-testid="app-shell-header"
	class="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur"
>
	{#if isImpersonating}
		<div
			class="bg-destructive px-4 py-1.5 text-center text-sm text-white"
			data-testid="impersonation-banner"
		>
			You are impersonating
			<strong data-testid="impersonated-user-name"
				>{$sessionQuery.data?.user?.name ?? $sessionQuery.data?.user?.email}</strong
			>
			<button
				type="button"
				class="ml-3 rounded bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30"
				data-testid="stop-impersonating-button"
				onclick={() => void handleStopImpersonating()}
			>
				Stop impersonating
			</button>
		</div>
	{/if}
	<div
		class="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4"
	>
		<a href={resolve("/")} class="flex items-center gap-3">
			<img src="/icon6.svg" alt="Starter" class="h-9 w-9 rounded-full">
			<span class="text-sm font-semibold text-muted-foreground"> Starter </span>
		</a>
		<nav
			class="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
		>
			{#each STATIC_LINKS as link (link.to)}
				<a
					href={link.to}
					class="transition hover:text-foreground"
					data-testid={`nav-link-${link.label.toLowerCase().replaceAll(" ", "-")}`}
				>
					{link.label}
				</a>
			{/each}
			{#if hasOrgAccess}
				<a
					href={resolve("/org/team")}
					class="transition hover:text-foreground"
					data-testid="nav-link-team"
					>Team</a
				>
			{/if}
			{#if isAdmin}
				<a
					href={resolve("/admin")}
					class="font-medium text-primary transition hover:text-primary/80"
					data-testid="nav-link-admin"
					>Admin</a
				>
			{/if}
		</nav>
		<div class="flex items-center gap-2">
			<OrgSwitcher />
			<!-- Pass the already-fetched session down so NotificationCenter
			     doesn't create a second independent subscription. -->
			<NotificationCenter {sessionQuery} />
			<UserMenu {pendingInvitationCount} />
		</div>
	</div>
</header>
