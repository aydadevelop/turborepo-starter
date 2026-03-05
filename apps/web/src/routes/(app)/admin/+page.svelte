<script lang="ts">
	import * as Card from "@my-app/ui/components/card";
	import { createQuery } from "@tanstack/svelte-query";
	import { resolve } from "$app/paths";
	import { orpc } from "$lib/orpc";

	const orgsQuery = createQuery(() =>
		orpc.admin.organizations.listOrgs.queryOptions({ input: { limit: 5 } })
	);
	const usersQuery = createQuery(() =>
		orpc.admin.organizations.listUsers.queryOptions({ input: { limit: 5 } })
	);
</script>

<div class="grid gap-4 sm:grid-cols-2">
	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Description>Organizations</Card.Description>
			<Card.Title class="text-3xl">{orgsQuery.data?.total ?? "—"}</Card.Title>
		</Card.Header>
		<Card.Footer>
			<a
				href={resolve("/admin/organizations")}
				class="text-sm text-primary hover:underline"
			>
				View all &rarr;
			</a>
		</Card.Footer>
	</Card.Root>

	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Description>Users</Card.Description>
			<Card.Title class="text-3xl">{usersQuery.data?.total ?? "—"}</Card.Title>
		</Card.Header>
		<Card.Footer>
			<a
				href={resolve("/admin/users")}
				class="text-sm text-primary hover:underline"
			>
				View all &rarr;
			</a>
		</Card.Footer>
	</Card.Root>
</div>
