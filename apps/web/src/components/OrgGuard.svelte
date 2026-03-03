<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { derived } from "svelte/store";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import { hasAuthenticatedSession } from "$lib/auth-session";
	import { userOrganizationsQueryOptions } from "$lib/query-options";

	const { children } = $props();

	// Paths that require an active organization. The root /, /login,
	// /org/*, and /invitations are intentionally excluded so users can
	// always reach the org-creation or invitation-acceptance flows.
	const ORG_REQUIRED_PREFIXES = ["/chat", "/dashboard"];

	const sessionQuery = authClient.useSession();

	const orgsQuery = createQuery(
		derived(sessionQuery, ($session) =>
			userOrganizationsQueryOptions({
				enabled: hasAuthenticatedSession($session.data),
			})
		)
	);

	$effect(() => {
		// Wait for session to settle.
		if ($sessionQuery.isPending) return;
		// Not logged in — other guards handle login redirect.
		if (!hasAuthenticatedSession($sessionQuery.data)) return;
		// Orgs haven't loaded yet or errored — don't redirect on error to avoid
		// trapping the user in a redirect loop when the API is down.
		if ($orgsQuery.isPending || $orgsQuery.isError) return;

		const onProtectedPath = ORG_REQUIRED_PREFIXES.some((prefix) =>
			page.url.pathname.startsWith(prefix)
		);
		if (!onProtectedPath) return;

		if (($orgsQuery.data?.length ?? 0) === 0) {
			const nextPath = `${page.url.pathname}${page.url.search}`;
			goto(
				`${resolve("/org/create")}?reason=required&next=${encodeURIComponent(nextPath)}`,
				{ replaceState: true }
			);
		}
	});
</script>

{@render children()}
