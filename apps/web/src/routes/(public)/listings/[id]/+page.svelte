<script lang="ts">
	import * as Card from "@my-app/ui/components/card";
	import { createQuery } from "@tanstack/svelte-query";
	import { page } from "$app/state";
	import { orpc } from "$lib/orpc";
	import BoatRentBookingSurfacePanel from "../../../../components/public/BoatRentBookingSurfacePanel.svelte";
	import BookingRequestPanel from "../../../../components/public/BookingRequestPanel.svelte";

	const listingQuery = createQuery(() => ({
		...orpc.storefront.get.queryOptions({
			input: { id: page.params.id ?? "" },
		}),
	}));
</script>

<svelte:head>
	<title>{listingQuery.data?.name ?? "Listing"}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
	<a
		href="/listings"
		class="mb-6 inline-block text-sm text-blue-600 hover:underline"
	>
		← Back to listings
	</a>

	{#if listingQuery.isPending}
		<div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
			<div class="animate-pulse space-y-4">
				<div class="h-8 w-2/3 rounded bg-gray-200"></div>
				<div class="h-4 w-1/4 rounded bg-gray-100"></div>
				<div class="h-64 w-full rounded-lg bg-gray-100"></div>
			</div>
			<div class="h-[420px] rounded-lg border bg-gray-50"></div>
		</div>
	{:else if listingQuery.isError}
		<div class="rounded-lg border border-destructive bg-card p-6 text-red-600">
			Listing not found or unavailable.
		</div>
	{:else if listingQuery.data}
		{@const listing = listingQuery.data}

		<div
			class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] lg:items-start"
		>
			<div class="space-y-6">
				{#if listing.primaryImageUrl}
					<img
						src={listing.primaryImageUrl}
						alt={listing.name}
						class="h-64 w-full rounded-lg object-cover"
					>
				{/if}

				<Card.Root>
					<Card.Content class="space-y-4 py-6">
						<div class="flex flex-wrap gap-2">
							<span
								class="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
							>
								{listing.listingTypeLabel}
							</span>
							<span
								class="inline-block rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500"
							>
								{listing.serviceFamilyPolicy.label}
							</span>
							<span
								class="inline-block rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500"
							>
								{listing.serviceFamilyPolicy.customerPresentation.bookingMode === "request"
									? "Request booking"
									: "Instant booking"}
							</span>
							<span
								class="inline-block rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500"
							>
								{listing.serviceFamilyPolicy.customerPresentation.customerFocus ===
								"asset"
									? "Asset-first presentation"
									: "Experience-first presentation"}
							</span>
							{#if listing.boatRentSummary?.capacity}
								<span
									class="inline-block rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500"
								>
									Up to {listing.boatRentSummary.capacity} guests
								</span>
							{/if}
							{#if listing.boatRentSummary?.captainModeLabel}
								<span
									class="inline-block rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500"
								>
									{listing.boatRentSummary.captainModeLabel}
								</span>
							{/if}
							{#if listing.boatRentSummary?.departureArea}
								<span
									class="inline-block rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500"
								>
									{listing.boatRentSummary.departureArea}
								</span>
							{/if}
							{#if listing.excursionSummary?.durationLabel}
								<span
									class="inline-block rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500"
								>
									{listing.excursionSummary.durationLabel}
								</span>
							{/if}
							{#if listing.excursionSummary?.groupFormatLabel}
								<span
									class="inline-block rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500"
								>
									{listing.excursionSummary.groupFormatLabel}
								</span>
							{/if}
							{#if listing.excursionSummary?.primaryLanguage}
								<span
									class="inline-block rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500"
								>
									{listing.excursionSummary.primaryLanguage}
								</span>
							{/if}
						</div>

						<div class="space-y-2">
							<h1 class="text-3xl font-bold">{listing.name}</h1>
							{#if listing.description}
								<p class="text-gray-700">{listing.description}</p>
							{:else}
								<p class="text-sm text-muted-foreground">
									The operator has not added a description yet.
								</p>
							{/if}
						</div>
					</Card.Content>
				</Card.Root>

				{#if listing.boatRentSummary}
					<Card.Root>
						<Card.Header>
							<Card.Title>Boat rent profile</Card.Title>
							<Card.Description>
								Operator-defined facts that shape this charter request.
							</Card.Description>
						</Card.Header>
						<Card.Content class="grid gap-4 md:grid-cols-2">
							<div class="space-y-1 text-sm">
								<p class="font-medium">Capacity</p>
								<p class="text-muted-foreground">
									{listing.boatRentSummary.capacity ?? "Not specified"}
								</p>
							</div>
							<div class="space-y-1 text-sm">
								<p class="font-medium">Captain policy</p>
								<p class="text-muted-foreground">
									{listing.boatRentSummary.captainModeLabel}
								</p>
							</div>
							<div class="space-y-1 text-sm">
								<p class="font-medium">Departure area</p>
								<p class="text-muted-foreground">
									{listing.boatRentSummary.departureArea ?? "Not specified"}
								</p>
							</div>
							<div class="space-y-1 text-sm">
								<p class="font-medium">Base port</p>
								<p class="text-muted-foreground">
									{listing.boatRentSummary.basePort ?? "Not specified"}
								</p>
							</div>
							<div class="space-y-1 text-sm">
								<p class="font-medium">Fuel policy</p>
								<p class="text-muted-foreground">
									{listing.boatRentSummary.fuelPolicyLabel}
								</p>
							</div>
							<div class="space-y-1 text-sm">
								<p class="font-medium">Booking mode</p>
								<p class="text-muted-foreground">
									{listing.boatRentSummary.instantBookAllowed
											? "Instant requests enabled"
											: "Manual confirmation required"}
								</p>
							</div>
						</Card.Content>
					</Card.Root>
				{/if}

				{#if listing.excursionSummary}
					<Card.Root>
						<Card.Header>
							<Card.Title>Excursion profile</Card.Title>
							<Card.Description>
								Operator-defined experience facts used in the customer-facing
								excursion presentation.
							</Card.Description>
						</Card.Header>
						<Card.Content class="grid gap-4 md:grid-cols-2">
							<div class="space-y-1 text-sm">
								<p class="font-medium">Meeting point</p>
								<p class="text-muted-foreground">
									{listing.excursionSummary.meetingPoint ?? "Not specified"}
								</p>
							</div>
							<div class="space-y-1 text-sm">
								<p class="font-medium">Duration</p>
								<p class="text-muted-foreground">
									{listing.excursionSummary.durationLabel ?? "Not specified"}
								</p>
							</div>
							<div class="space-y-1 text-sm">
								<p class="font-medium">Group format</p>
								<p class="text-muted-foreground">
									{listing.excursionSummary.groupFormatLabel}
								</p>
							</div>
							<div class="space-y-1 text-sm">
								<p class="font-medium">Primary language</p>
								<p class="text-muted-foreground">
									{listing.excursionSummary.primaryLanguage ?? "Not specified"}
								</p>
							</div>
							<div class="space-y-1 text-sm">
								<p class="font-medium">Max group size</p>
								<p class="text-muted-foreground">
									{listing.excursionSummary.maxGroupSize ?? "Not specified"}
								</p>
							</div>
							<div class="space-y-1 text-sm">
								<p class="font-medium">Booking mode</p>
								<p class="text-muted-foreground">
									{listing.excursionSummary.instantBookAllowed
											? "Instant confirmation supported"
											: "Operator confirms manually"}
								</p>
							</div>
						</Card.Content>
					</Card.Root>
				{/if}

				{#if listing.metadata}
					<Card.Root>
						<Card.Header>
							<Card.Title>Listing details</Card.Title>
							<Card.Description>
								Metadata published with this marketplace listing.
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<pre
								class="overflow-x-auto rounded bg-gray-50 p-4 text-xs text-gray-700"
							>{JSON.stringify(listing.metadata, null, 2)}</pre>
						</Card.Content>
					</Card.Root>
				{/if}
			</div>

			{#if listing.serviceFamily === "boat_rent"}
				<BoatRentBookingSurfacePanel
					listingId={listing.id}
					listingName={listing.name}
				/>
			{:else}
				<BookingRequestPanel listingId={listing.id} listingName={listing.name} />
			{/if}
		</div>
	{/if}
</div>
