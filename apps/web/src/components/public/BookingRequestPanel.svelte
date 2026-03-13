<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import { Textarea } from "@my-app/ui/components/textarea";
	import {
		createMutation,
		createQuery,
		skipToken,
	} from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import { hasAuthenticatedSession } from "$lib/auth-session";
	import { orpc, queryClient } from "$lib/orpc";

	let {
		listingId,
		listingName,
	}: {
		listingId: string;
		listingName: string;
	} = $props();

	const sessionQuery = authClient.useSession();

	let startsAtLocal = $state("");
	let endsAtLocal = $state("");
	let passengers = $state("1");
	let contactName = $state("");
	let contactPhone = $state("");
	let contactEmail = $state("");
	let timezone = $state(
		typeof Intl !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
			: "UTC"
	);
	let notes = $state("");
	let specialRequests = $state("");
	let createdBooking = $state<{
		id: string;
		totalPriceCents: number;
		currency: string;
	} | null>(null);

	function toIsoString(localValue: string): string | null {
		if (!localValue) return null;
		const parsed = new Date(localValue);
		return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
	}

	function formatMoney(amountCents: number, currency: string) {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			maximumFractionDigits: 2,
		}).format(amountCents / 100);
	}

	const passengerCount = $derived.by(() => {
		const parsed = Number.parseInt(passengers, 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
	});

	const bookingSlotInput = $derived.by(() => {
		const startsAt = toIsoString(startsAtLocal);
		const endsAt = toIsoString(endsAtLocal);

		if (!startsAt || !endsAt) return null;
		if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) return null;

		return {
			listingId,
			startsAt,
			endsAt,
			passengers: passengerCount,
		};
	});

	const quoteQuery = createQuery(() => {
		const input = bookingSlotInput;
		return orpc.pricing.getQuote.queryOptions({
			input: input
				? {
						listingId: input.listingId,
						startsAt: input.startsAt,
						endsAt: input.endsAt,
						passengers: input.passengers,
					}
				: skipToken,
		});
	});

	const slotQuery = createQuery(() => {
		const input = bookingSlotInput;
		return orpc.availability.checkSlot.queryOptions({
			input: input
				? {
						listingId: input.listingId,
						startsAt: input.startsAt,
						endsAt: input.endsAt,
					}
				: skipToken,
		});
	});

	const createBookingMutation = createMutation(() =>
		orpc.booking.create.mutationOptions({
			onSuccess: async (booking) => {
				createdBooking = {
					id: booking.id,
					totalPriceCents: booking.totalPriceCents,
					currency: booking.currency,
				};
				await queryClient.invalidateQueries({ queryKey: orpc.booking.key() });
			},
		})
	);

	const isAuthenticated = $derived(hasAuthenticatedSession($sessionQuery.data));
	const availabilityKnown = $derived(slotQuery.data?.available ?? null);
	const canSubmitBooking = $derived(
		Boolean(bookingSlotInput) &&
			availabilityKnown === true &&
			Boolean(quoteQuery.data) &&
			!createBookingMutation.isPending
	);

	async function handleBookingRequest() {
		const input = bookingSlotInput;
		if (!input) return;

		if (!isAuthenticated) {
			await goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
			);
			return;
		}

		if (!canSubmitBooking || !quoteQuery.data) return;

		createdBooking = null;
		createBookingMutation.mutate({
			listingId: input.listingId,
			startsAt: input.startsAt,
			endsAt: input.endsAt,
			passengers: input.passengers,
			contactName: contactName.trim() || undefined,
			contactPhone: contactPhone.trim() || undefined,
			contactEmail: contactEmail.trim() || undefined,
			timezone: timezone.trim() || undefined,
			notes: notes.trim() || undefined,
			specialRequests: specialRequests.trim() || undefined,
			currency: quoteQuery.data.currency,
		});
	}
</script>

<Card.Root class="sticky top-6">
	<Card.Header>
		<Card.Title>Request this booking</Card.Title>
		<Card.Description>
			Check live availability, preview the price, and send your request for {listingName}.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<Label for="booking-starts-at">Start</Label>
				<Input id="booking-starts-at" type="datetime-local" bind:value={startsAtLocal} />
			</div>
			<div class="space-y-2">
				<Label for="booking-ends-at">End</Label>
				<Input id="booking-ends-at" type="datetime-local" bind:value={endsAtLocal} />
			</div>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<Label for="booking-passengers">Passengers</Label>
				<Input id="booking-passengers" type="number" min="1" step="1" bind:value={passengers} />
			</div>
			<div class="space-y-2">
				<Label for="booking-timezone">Timezone</Label>
				<Input id="booking-timezone" type="text" bind:value={timezone} placeholder="UTC" />
			</div>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<Label for="booking-contact-name">Contact name</Label>
				<Input id="booking-contact-name" type="text" bind:value={contactName} placeholder="Jane Doe" />
			</div>
			<div class="space-y-2">
				<Label for="booking-contact-phone">Contact phone</Label>
				<Input id="booking-contact-phone" type="tel" bind:value={contactPhone} placeholder="+7 (___) ___-__-__" />
			</div>
		</div>

		<div class="space-y-2">
			<Label for="booking-contact-email">Contact email</Label>
			<Input id="booking-contact-email" type="email" bind:value={contactEmail} placeholder="you@example.com" />
		</div>

		<div class="space-y-2">
			<Label for="booking-notes">Notes</Label>
			<Textarea id="booking-notes" bind:value={notes} rows={3} placeholder="Share any trip details or questions for the operator." />
		</div>

		<div class="space-y-2">
			<Label for="booking-special-requests">Special requests</Label>
			<Textarea id="booking-special-requests" bind:value={specialRequests} rows={3} placeholder="Accessibility, catering, or timing requests." />
		</div>

		{#if bookingSlotInput === null && (startsAtLocal || endsAtLocal)}
			<p class="text-sm text-destructive">
				Choose a valid time range before requesting a quote.
			</p>
		{/if}

		{#if bookingSlotInput}
			<div class="rounded-lg border bg-muted/30 p-4 space-y-3">
				<div>
					<p class="text-sm font-medium">Live booking preview</p>
					<p class="text-xs text-muted-foreground">
						Pricing and availability are checked against the current live API.
					</p>
				</div>

				{#if quoteQuery.isPending}
					<p class="text-sm text-muted-foreground">Fetching live quote...</p>
				{:else if quoteQuery.isError}
					<p class="text-sm text-destructive">
						{quoteQuery.error?.message ?? "Unable to calculate a quote for this slot."}
					</p>
				{:else if quoteQuery.data}
					<div class="space-y-1 text-sm">
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Base</span>
							<span>{formatMoney(quoteQuery.data.baseCents, quoteQuery.data.currency)}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Adjustments</span>
							<span>{formatMoney(quoteQuery.data.adjustmentCents, quoteQuery.data.currency)}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Fees + taxes</span>
							<span>{formatMoney(quoteQuery.data.serviceFeeCents + quoteQuery.data.taxCents, quoteQuery.data.currency)}</span>
						</div>
						<div class="flex items-center justify-between border-t pt-2 font-medium">
							<span>Total</span>
							<span>{formatMoney(quoteQuery.data.totalCents, quoteQuery.data.currency)}</span>
						</div>
					</div>
				{/if}

				{#if slotQuery.isPending}
					<p class="text-sm text-muted-foreground">Checking slot availability...</p>
				{:else if slotQuery.isError}
					<p class="text-sm text-destructive">
						{slotQuery.error?.message ?? "Unable to verify slot availability."}
					</p>
				{:else if availabilityKnown === true}
					<p class="text-sm text-green-600">This slot is currently available.</p>
				{:else if availabilityKnown === false}
					<p class="text-sm text-destructive">This slot is no longer available.</p>
				{/if}
			</div>
		{/if}

		{#if createdBooking}
			<div class="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
				<p class="font-medium">Booking request submitted</p>
				<p>
					Request <span class="font-mono">{createdBooking.id}</span> was created for
					{formatMoney(createdBooking.totalPriceCents, createdBooking.currency)}.
				</p>
			</div>
		{/if}

		{#if createBookingMutation.isError}
			<p class="text-sm text-destructive">
				{createBookingMutation.error?.message ?? "Booking request failed. Please try again."}
			</p>
		{/if}

		{#if !isAuthenticated}
			<p class="text-xs text-muted-foreground">
				You can preview pricing and availability now. Signing in is only required when you send the final booking request.
			</p>
		{/if}
	</Card.Content>
	<Card.Footer class="flex flex-col items-stretch gap-3">
		<Button onclick={() => void handleBookingRequest()} disabled={!bookingSlotInput || availabilityKnown === false || quoteQuery.isPending || slotQuery.isPending || createBookingMutation.isPending}>
			{#if createBookingMutation.isPending}
				Submitting request...
			{:else if !isAuthenticated}
				Sign in to request booking
			{:else}
				Request booking
			{/if}
		</Button>

		{#if bookingSlotInput && availabilityKnown === true && quoteQuery.data && !canSubmitBooking && isAuthenticated}
			<p class="text-xs text-muted-foreground">
				Pricing is ready, but the request can’t be submitted until the preview fully settles.
			</p>
		{/if}
	</Card.Footer>
</Card.Root>
