<script lang="ts">
	import * as Card from "@full-stack-cf-app/ui/components/card";
	import { createQuery } from "@tanstack/svelte-query";
	import { resolve } from "$app/paths";
	import { orpc } from "$lib/orpc";

	const orgsQuery = createQuery(
		orpc.admin.organizations.listOrgs.queryOptions({ input: { limit: 5 } })
	);
	const boatsQuery = createQuery(
		orpc.admin.boats.list.queryOptions({ input: { limit: 5 } })
	);
	const bookingsQuery = createQuery(
		orpc.admin.bookings.list.queryOptions({ input: { limit: 5 } })
	);
	const ticketsQuery = createQuery(
		orpc.admin.support.listTickets.queryOptions({ input: { limit: 5 } })
	);
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Description>Organizations</Card.Description>
			<Card.Title class="text-3xl">{$orgsQuery.data?.total ?? "—"}</Card.Title>
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
			<Card.Description>Boats</Card.Description>
			<Card.Title class="text-3xl">{$boatsQuery.data?.total ?? "—"}</Card.Title>
		</Card.Header>
		<Card.Footer>
			<a
				href={resolve("/admin/boats")}
				class="text-sm text-primary hover:underline"
			>
				View all &rarr;
			</a>
		</Card.Footer>
	</Card.Root>

	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Description>Bookings</Card.Description>
			<Card.Title class="text-3xl">
				{$bookingsQuery.data?.total ?? "—"}
			</Card.Title>
		</Card.Header>
		<Card.Footer>
			<a
				href={resolve("/admin/bookings")}
				class="text-sm text-primary hover:underline"
			>
				View all &rarr;
			</a>
		</Card.Footer>
	</Card.Root>

	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Description>Support Tickets</Card.Description>
			<Card.Title class="text-3xl">
				{$ticketsQuery.data?.total ?? "—"}
			</Card.Title>
		</Card.Header>
		<Card.Footer>
			<a
				href={resolve("/admin/support")}
				class="text-sm text-primary hover:underline"
			>
				View all &rarr;
			</a>
		</Card.Footer>
	</Card.Root>
</div>
