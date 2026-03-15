<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { createQuery } from "@tanstack/svelte-query";
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
	import { orpc } from "$lib/orpc";
	import {
		userInvitationsQueryOptions,
		userOrganizationsQueryOptions,
	} from "$lib/query-options";

	const { children } = $props();

	const sessionQuery = authClient.useSession();
	const initialSession = $derived(getPageInitialSessionData(page.data));
	const sessionData = $derived(
		resolveSessionData($sessionQuery, initialSession),
	);
	const sessionPending = $derived(
		isSessionPending($sessionQuery, initialSession),
	);

	const orgsQuery = createQuery(() =>
		userOrganizationsQueryOptions({
			enabled: hasAuthenticatedSession(sessionData),
		}),
	);

	const canManageQuery = createQuery(() => ({
		...orpc.canManageOrganization.queryOptions(),
		retry: false,
	}));

	const invitationsQuery = createQuery(() =>
		userInvitationsQueryOptions({
			enabled: hasAuthenticatedSession(sessionData),
		}),
	);

	$effect(() => {
		if (sessionPending) return;
		if (!hasAuthenticatedSession(sessionData)) {
			goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`,
			);
		}
	});

	const hasOrg = $derived((orgsQuery.data?.length ?? 0) > 0);
	const canManage = $derived(
		canManageQuery.data?.canManageOrganization ?? false,
	);
	const pendingInviteCount = $derived(
		(invitationsQuery.data ?? []).filter((inv) => inv.status === "pending")
			.length,
	);

	const isActive = (href: string) => page.url.pathname === href;
	const isActivePrefix = (href: string) => page.url.pathname.startsWith(href);
</script>

{#if sessionPending}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if hasAuthenticatedSession(sessionData)}
	<div class="mx-auto max-w-6xl px-6 py-6 space-y-4">
		<div>
			<h1 class="text-2xl font-bold" data-testid="org-heading">
				Organization
			</h1>
			<nav class="mt-3 flex gap-1 border-b">
				{#if hasOrg && canManage}
					<a
						href={resolve("/org/team")}
						class="whitespace-nowrap px-3 py-2 text-sm transition
							{isActive(resolve('/org/team'))
							? 'border-b-2 border-primary font-medium text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Team
					</a>
					<a
						href={resolve("/org/team/invite")}
						class="whitespace-nowrap px-3 py-2 text-sm transition
							{isActive(resolve('/org/team/invite'))
							? 'border-b-2 border-primary font-medium text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Invite
					</a>
					<a
						href={resolve("/org/listings")}
						class="whitespace-nowrap px-3 py-2 text-sm transition
							{isActivePrefix(resolve('/org/listings'))
							? 'border-b-2 border-primary font-medium text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Listings
					</a>
					<a
						href={resolve("/org/calendar")}
						class="whitespace-nowrap px-3 py-2 text-sm transition
							{isActivePrefix(resolve('/org/calendar'))
							? 'border-b-2 border-primary font-medium text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Calendar
					</a>
					<a
						href={resolve("/org/settings")}
						class="whitespace-nowrap px-3 py-2 text-sm transition
							{isActive(resolve('/org/settings'))
							? 'border-b-2 border-primary font-medium text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Settings
					</a>
				{:else if !hasOrg}
					<a
						href={resolve("/org/create")}
						class="whitespace-nowrap px-3 py-2 text-sm transition
							{isActivePrefix(resolve('/org/create'))
							? 'border-b-2 border-primary font-medium text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Create
					</a>
				{/if}
				<a
					href={resolve("/org/invitations")}
					class="whitespace-nowrap px-3 py-2 text-sm transition
						{isActive(resolve('/org/invitations'))
						? 'border-b-2 border-primary font-medium text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Invitations
					{#if pendingInviteCount > 0}
						<Badge
							variant="secondary"
							class="ml-1 h-4 px-1 text-[10px]"
						>
							{pendingInviteCount}
						</Badge>
					{/if}
				</a>
			</nav>
		</div>
		{@render children()}
	</div>
{/if}
