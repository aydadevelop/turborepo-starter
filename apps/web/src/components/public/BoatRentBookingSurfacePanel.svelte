<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import * as NativeSelect from "@my-app/ui/components/native-select";
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
	import {
		buildBoatRentBookingRequestInput,
		buildBoatRentBookingSurfaceInput,
		getDisplayedBoatRentQuote,
		normalizeAppliedDiscountCode,
	} from "./boat-rent-booking-surface";

	let { listingId, listingName }: { listingId: string; listingName: string } =
		$props();

	const sessionQuery = authClient.useSession();

	let selectedDate = $state("");
	let durationMinutes = $state("120");
	let passengers = $state("1");
	let contactName = $state("");
	let contactPhone = $state("");
	let contactEmail = $state("");
	let notes = $state("");
	let specialRequests = $state("");
	let discountCodeInput = $state("");
	let appliedDiscountCode = $state("");
	let selectedSlotStartsAt = $state<string | null>(null);
	let createdBooking = $state<{
		currency: string;
		id: string;
		totalPriceCents: number;
	} | null>(null);

	const isAuthenticated = $derived(hasAuthenticatedSession($sessionQuery.data));

	const passengerCount = $derived.by(() => {
		const parsed = Number.parseInt(passengers, 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
	});

	const requestedDurationMinutes = $derived.by(() => {
		const parsed = Number.parseInt(durationMinutes, 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
	});

	const bookingSurfaceInput = $derived.by(() => {
		return buildBoatRentBookingSurfaceInput({
			listingId,
			selectedDate,
			requestedDurationMinutes,
			passengerCount,
			appliedDiscountCode,
		});
	});

	const bookingSurfaceQuery = createQuery(() => {
		const input = bookingSurfaceInput;
		return orpc.storefront.getBookingSurface.queryOptions({
			input: input ?? skipToken,
		});
	});

	$effect(() => {
		const surface = bookingSurfaceQuery.data;
		if (!surface) {
			selectedSlotStartsAt = null;
			return;
		}

		const availableSlots = surface.slots.filter(
			(slot) => slot.status === "available"
		);
		if (
			selectedSlotStartsAt &&
			availableSlots.some((slot) => slot.startsAt === selectedSlotStartsAt)
		) {
			return;
		}

		selectedSlotStartsAt = availableSlots[0]?.startsAt ?? null;
	});

	const durationOptions = $derived.by(() => {
		const options = bookingSurfaceQuery.data?.durationOptionsMinutes ?? [
			60, 120, 180, 240,
		];
		const selected = requestedDurationMinutes;
		return [...new Set(selected ? [...options, selected] : options)].sort(
			(left, right) => left - right
		);
	});

	const selectedSlot = $derived.by(
		() =>
			bookingSurfaceQuery.data?.slots.find(
				(slot) => slot.startsAt === selectedSlotStartsAt
			) ?? null
	);

	const selectedSlotDisplayQuote = $derived.by(() =>
		selectedSlot?.quote ? getDisplayedBoatRentQuote(selectedSlot.quote) : null
	);

	function formatMoney(amountCents: number, currency: string) {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			maximumFractionDigits: 2,
		}).format(amountCents / 100);
	}

	function formatDuration(minutes: number) {
		if (minutes % 60 === 0) {
			const hours = minutes / 60;
			return hours === 1 ? "1 hour" : `${hours} hours`;
		}

		const hours = Math.floor(minutes / 60);
		const remaining = minutes % 60;
		if (hours === 0) {
			return `${remaining} min`;
		}
		return `${hours}h ${remaining}m`;
	}

	const createBooking = createMutation(() =>
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

	const canSubmitBooking = $derived(
		Boolean(selectedSlot) &&
			selectedSlot?.status === "available" &&
			Boolean(selectedSlot.quote) &&
			!createBooking.isPending
	);

	async function submitBookingRequest() {
		if (!isAuthenticated) {
			await goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
			);
			return;
		}

		if (
			!selectedSlot ||
			selectedSlot.status !== "available" ||
			!selectedSlot.quote
		) {
			return;
		}

		createdBooking = null;
		const payload = buildBoatRentBookingRequestInput({
			listingId,
			selectedSlot,
			passengers: passengerCount,
			contactName,
			contactPhone,
			contactEmail,
			timezone: bookingSurfaceQuery.data?.timezone,
			notes,
			specialRequests,
			discountCode: appliedDiscountCode,
		});
		if (!payload) {
			return;
		}
		createBooking.mutate(payload);
	}

	function applyDiscountCode() {
		appliedDiscountCode = normalizeAppliedDiscountCode(discountCodeInput) ?? "";
	}
</script>

<Card.Root class="sticky top-6">
	<Card.Header>
		<Card.Title>Request this charter</Card.Title>
		<Card.Description>
			Choose a date and duration to see live slot availability and price
			previews for
			{listingName}.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="grid gap-4 sm:grid-cols-3">
			<div class="space-y-2">
				<Label for="booking-date">Date</Label>
				<Input id="booking-date" type="date" bind:value={selectedDate} />
			</div>
			<div class="space-y-2">
				<Label for="booking-duration">Duration</Label>
				<NativeSelect.Root id="booking-duration" bind:value={durationMinutes}>
					{#each durationOptions as option (option)}
						<NativeSelect.Option value={String(option)}>
							{formatDuration(option)}
						</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</div>
			<div class="space-y-2">
				<Label for="booking-passengers">Passengers</Label>
				<Input
					id="booking-passengers"
					type="number"
					min="1"
					step="1"
					bind:value={passengers}
				/>
			</div>
		</div>

		{#if bookingSurfaceInput}
			<div class="rounded-lg border bg-muted/30 p-4 space-y-3">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium">Live booking surface</p>
						<p class="text-xs text-muted-foreground">
							Times shown in
							{bookingSurfaceQuery.data?.timezone ?? "listing timezone"}.
						</p>
					</div>
					{#if bookingSurfaceQuery.data}
						<div class="text-right text-xs text-muted-foreground">
							<p>
								{bookingSurfaceQuery.data.summary.availableSlotCount}
								available
							</p>
							<p>{bookingSurfaceQuery.data.summary.blockedSlotCount} blocked</p>
							{#if bookingSurfaceQuery.data.summary.specialPricedSlotCount > 0}
								<p>
									{bookingSurfaceQuery.data.summary.specialPricedSlotCount}
									with special pricing
								</p>
							{/if}
						</div>
					{/if}
				</div>

				{#if bookingSurfaceQuery.isPending}
					<p class="text-sm text-muted-foreground">
						Calculating live slots and pricing...
					</p>
				{:else if bookingSurfaceQuery.isError}
					<p class="text-sm text-destructive">
						{bookingSurfaceQuery.error?.message ??
							"Unable to build the booking surface for this listing."}
					</p>
				{:else if bookingSurfaceQuery.data}
					{#if !bookingSurfaceQuery.data.pricingConfigured}
						<p class="text-sm text-amber-700">
							This listing does not have active pricing configured yet, so
							quotes are unavailable.
						</p>
					{/if}

					{#if bookingSurfaceQuery.data.slots.length === 0}
						<p class="text-sm text-muted-foreground">
							No slot candidates are available for the selected date and
							duration.
						</p>
					{:else}
						<div class="grid gap-2 sm:grid-cols-2">
							{#each bookingSurfaceQuery.data.slots as slot (slot.startsAt)}
								<button
									type="button"
									class={`rounded-lg border p-3 text-left transition ${
										slot.startsAt === selectedSlotStartsAt
											? "border-foreground bg-card shadow-sm"
											: "border-border bg-background"
									} ${
										slot.status === "available"
											? "hover:border-foreground/50"
											: "cursor-not-allowed opacity-75"
									}`}
									disabled={slot.status !== "available"}
									onclick={() => {
										if (slot.status === "available") {
											selectedSlotStartsAt = slot.startsAt;
										}
									}}
								>
									<div class="flex items-start justify-between gap-3">
										<div>
											<p class="text-sm font-medium">
												{slot.startsAtLabel}
												→ {slot.endsAtLabel}
											</p>
											<p class="text-xs text-muted-foreground">
												{slot.statusLabel}
											</p>
										</div>
										{#if slot.quote}
											<p class="text-sm font-medium">
												{formatMoney(
													slot.quote.discountPreview?.status === "applied"
														? (slot.quote.discountPreview.discountedTotalCents ??
																slot.quote.totalCents)
														: slot.quote.totalCents,
													slot.quote.currency,
												)}
											</p>
										{/if}
									</div>

									{#if slot.quote?.hasSpecialPricing}
										<p class="mt-2 text-xs text-amber-700">
											Special pricing rules apply to this slot.
										</p>
									{/if}

									{#if slot.status === "minimum_duration_not_met"}
										<p class="mt-2 text-xs text-muted-foreground">
											Minimum duration here is
											{formatDuration(slot.minimumDurationMinutes)}.
										</p>
									{:else if slot.quote?.discountPreview?.status === "applied"}
										<p class="mt-2 text-xs text-green-700">
											Code {slot.quote.discountPreview.code} applied.
										</p>
									{:else if slot.status === "blocked" && slot.blockReason}
										<p class="mt-2 text-xs text-muted-foreground">
											{slot.blockReason}
										</p>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				Choose a date and duration to build the live booking surface.
			</p>
		{/if}

		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<Label for="booking-contact-name">Contact name</Label>
				<Input
					id="booking-contact-name"
					type="text"
					bind:value={contactName}
					placeholder="Jane Doe"
				/>
			</div>
			<div class="space-y-2">
				<Label for="booking-contact-phone">Contact phone</Label>
				<Input
					id="booking-contact-phone"
					type="tel"
					bind:value={contactPhone}
					placeholder="+7 (___) ___-__-__"
				/>
			</div>
		</div>

		<div class="space-y-2">
			<Label for="booking-contact-email">Contact email</Label>
			<Input
				id="booking-contact-email"
				type="email"
				bind:value={contactEmail}
				placeholder="you@example.com"
			/>
		</div>

		<div class="space-y-2">
			<Label for="booking-notes">Notes</Label>
			<Textarea
				id="booking-notes"
				bind:value={notes}
				rows={3}
				placeholder="Share trip details or planning notes for the operator."
			/>
		</div>

		<div class="space-y-2">
			<Label for="booking-special-requests">Special requests</Label>
			<Textarea
				id="booking-special-requests"
				bind:value={specialRequests}
				rows={3}
				placeholder="Accessibility, catering, route, or timing requests."
			/>
		</div>

		<div class="space-y-2">
			<Label for="booking-discount-code">Discount code</Label>
			<div class="flex gap-2">
				<Input
					id="booking-discount-code"
					type="text"
					bind:value={discountCodeInput}
					placeholder="SPRING10"
					class="uppercase"
				/>
				<Button type="button" variant="secondary" onclick={applyDiscountCode}>
					{appliedDiscountCode ? "Update code" : "Apply code"}
				</Button>
			</div>
			{#if appliedDiscountCode}
				<p class="text-xs text-muted-foreground">
					Applied code:
					<span class="font-mono">{appliedDiscountCode.toUpperCase()}</span>
				</p>
			{/if}
			{#if selectedSlot?.quote?.discountPreview?.status === "applied"}
				<p class="text-xs text-green-700">
					Code {selectedSlot.quote.discountPreview.code} applied to the selected
					slot.
				</p>
			{:else if selectedSlot?.quote?.discountPreview?.status === "invalid"}
				<p class="text-xs text-destructive">
					{selectedSlot.quote.discountPreview.reasonLabel ??
						"Discount code cannot be applied to the selected slot."}
				</p>
			{/if}
		</div>

		{#if selectedSlot?.quote}
			<div class="rounded-lg border bg-muted/20 p-4 space-y-2 text-sm">
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Base</span>
					<span
						>{formatMoney(selectedSlot.quote.baseCents, selectedSlot.quote.currency)}</span
					>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Adjustments</span>
					<span
						>{formatMoney(selectedSlot.quote.adjustmentCents, selectedSlot.quote.currency)}</span
					>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Subtotal</span>
					<span>
						{formatMoney(
							selectedSlotDisplayQuote?.subtotalCents ??
								selectedSlot.quote.subtotalCents,
							selectedSlot.quote.currency,
						)}
					</span>
				</div>
				{#if selectedSlot.quote.discountPreview?.status === "applied"}
					<div class="flex items-center justify-between text-green-700">
						<span class="text-muted-foreground">
							Discount ({selectedSlot.quote.discountPreview.code})
						</span>
						<span>
							-{formatMoney(
								selectedSlot.quote.discountPreview.appliedAmountCents,
								selectedSlot.quote.currency,
							)}
						</span>
					</div>
				{/if}
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Fees + taxes</span>
					<span>
						{formatMoney(
							selectedSlotDisplayQuote?.feeAndTaxCents ??
								selectedSlot.quote.serviceFeeCents + selectedSlot.quote.taxCents,
							selectedSlot.quote.currency,
						)}
					</span>
				</div>
				<div
					class="flex items-center justify-between border-t pt-2 font-medium"
				>
					<span>Total</span>
					<span>
						{formatMoney(
							selectedSlotDisplayQuote?.totalCents ??
								selectedSlot.quote.totalCents,
							selectedSlot.quote.currency,
						)}
					</span>
				</div>
			</div>
		{/if}

		{#if createdBooking}
			<div
				class="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700"
			>
				<p class="font-medium">Booking request submitted</p>
				<p>
					Request <span class="font-mono">{createdBooking.id}</span> was created
					for
					{formatMoney(createdBooking.totalPriceCents, createdBooking.currency)}.
				</p>
			</div>
		{/if}

		{#if createBooking.isError}
			<p class="text-sm text-destructive">
				{createBooking.error?.message ??
					"Booking request failed. Please try again."}
			</p>
		{/if}

		{#if !isAuthenticated}
			<p class="text-xs text-muted-foreground">
				You can explore slots and live pricing now. Signing in is only required
				when you send the request.
			</p>
		{/if}
	</Card.Content>
	<Card.Footer class="flex flex-col items-stretch gap-3">
		<Button
			onclick={() => void submitBookingRequest()}
			disabled={!canSubmitBooking}
		>
			{#if createBooking.isPending}
				Submitting request...
			{:else if !isAuthenticated}
				Sign in to request booking
			{:else}
				Request booking
			{/if}
		</Button>

		{#if selectedSlot && selectedSlot.status !== "available"}
			<p class="text-xs text-muted-foreground">
				Choose an available slot before sending the request.
			</p>
		{:else if !selectedSlot && bookingSurfaceQuery.data?.slots.length}
			<p class="text-xs text-muted-foreground">
				No available slot is currently selected.
			</p>
		{/if}
	</Card.Footer>
</Card.Root>
