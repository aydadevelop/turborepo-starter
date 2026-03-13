<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import ResourceBadgeCell from "../../components/operator/ResourceBadgeCell.svelte";
	import ResourceLinkCell from "../../components/operator/ResourceLinkCell.svelte";
	import ResourceTable from "../../components/operator/ResourceTable.svelte";
	import {
		createColumnHelper,
		renderComponent,
		type ColumnDef,
	} from "../../components/operator/resource-table";
	import SurfaceCard from "../../components/operator/SurfaceCard.svelte";
	import { orpc } from "$lib/orpc";

	const bookingsQuery = createQuery(() =>
		orpc.booking.listMyBookings.queryOptions({ input: {} })
	);
	const ticketsQuery = createQuery(() =>
		orpc.support.listMyTickets.queryOptions({ input: {} })
	);

	type BookingRow = {
		id: string;
		startsAt: string;
		endsAt: string;
		status: string;
		supportTicketId?: string;
		supportSubject?: string;
	};

	const rows = $derived(
		(bookingsQuery.data ?? []).map((booking) => {
			const ticket = (ticketsQuery.data?.items ?? []).find(
				(candidate) => candidate.bookingId === booking.id
			);
			return {
				id: booking.id,
				startsAt: booking.startsAt,
				endsAt: booking.endsAt,
				status: booking.status,
				supportTicketId: ticket?.id,
				supportSubject: ticket?.subject,
			} satisfies BookingRow;
		})
	);

	const columnHelper = createColumnHelper<BookingRow>();

	const columns: ColumnDef<BookingRow, any>[] = [
		columnHelper.accessor((row) => `#${row.id.slice(0, 8)}`, {
			id: "booking",
			header: "Booking",
			meta: {
				cellClass: "font-medium",
			},
		}),
		columnHelper.accessor(
			(row) =>
				`${new Date(row.startsAt).toLocaleDateString()} – ${new Date(row.endsAt).toLocaleDateString()}`,
			{
				id: "dates",
				header: "Dates",
				meta: {
					cellClass: "text-muted-foreground",
				},
			}
		),
		columnHelper.display({
			id: "status",
			header: "Status",
			cell: ({ row }) =>
				renderComponent(ResourceBadgeCell, {
					label: row.original.status,
					variant: "secondary",
				}),
		}),
		columnHelper.display({
			id: "support",
			header: "Support",
			cell: ({ row }) => {
				if (!row.original.supportTicketId) return "—";
				return renderComponent(ResourceLinkCell, {
					href: `/dashboard/support/${row.original.supportTicketId}`,
					label: row.original.supportSubject ?? "View ticket",
				});
			},
		}),
	];
</script>

<div class="space-y-4">
	<h1 class="text-2xl font-semibold">My Bookings</h1>

	<SurfaceCard
		title="Booking history"
		description="Your current and past bookings, with linked support threads when available."
		contentClass="pt-0"
	>
		{#snippet children()}
			<ResourceTable
				data={rows}
				columns={columns}
				getRowId={(row) => row.id}
				loading={bookingsQuery.isPending || ticketsQuery.isPending}
				errorMessage={bookingsQuery.isError || ticketsQuery.isError
					? "Failed to load bookings."
					: null}
				emptyMessage="You have no bookings yet."
			/>
		{/snippet}
	</SurfaceCard>
</div>
