<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { orpc } from "$lib/orpc";

	const bookingsQuery = createQuery(() => orpc.booking.listMyBookings.queryOptions({ input: {} }));

	const ticketsQuery = createQuery(() => orpc.support.listMyTickets.queryOptions({ input: {} }));

	const ticketsByBookingId = $derived(
		(ticketsQuery.data ?? []).reduce(
			(acc, t) => {
				if (t.bookingId) acc[t.bookingId] = t;
				return acc;
			},
			{} as Record<string, NonNullable<typeof ticketsQuery.data>[number]>,
		),
	);
</script>

<svelte:head>
	<title>My Bookings</title>
</svelte:head>

<div class="container max-w-3xl py-8">
	<h1 class="mb-6 text-2xl font-semibold">My Bookings</h1>

	{#if bookingsQuery.isPending}
		<p class="text-muted-foreground">Loading bookings…</p>
	{:else if bookingsQuery.isError}
		<p class="text-destructive">Failed to load bookings.</p>
	{:else if !bookingsQuery.data?.length}
		<p class="text-muted-foreground">You have no bookings yet.</p>
	{:else}
		<ul class="flex flex-col gap-4">
			{#each bookingsQuery.data as booking (booking.id)}
				{@const ticket = ticketsByBookingId[booking.id]}
				<li class="rounded-lg border p-4">
					<div class="flex items-start justify-between gap-2">
						<div>
							<p class="text-sm font-medium">Booking #{booking.id.slice(0, 8)}</p>
							<p class="text-sm text-muted-foreground">
								{new Date(booking.startsAt).toLocaleDateString()} –
								{new Date(booking.endsAt).toLocaleDateString()}
							</p>
						</div>
						<span class="rounded border px-2 py-0.5 text-xs font-medium capitalize">
							{booking.status}
						</span>
					</div>

					{#if ticket}
						<div class="mt-3 border-t pt-3">
							<a
								href="/dashboard/support/{ticket.id}"
								class="text-sm font-medium hover:underline"
							>
								Support: {ticket.subject}
							</a>
							<p class="text-xs capitalize text-muted-foreground">{ticket.status.replace(/_/g, " ")}</p>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
