<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle,
	} from "@full-stack-cf-app/ui/components/card";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { untrack } from "svelte";
	import { writable } from "svelte/store";
	import { dev } from "$app/environment";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { env as publicEnv } from "$env/dynamic/public";
	import { authClient } from "$lib/auth-client";
	import { parseBoatIdFromRef } from "$lib/boat-pages";
	import { orpc } from "$lib/orpc";
	import BoatBlockedRangesCard from "./BoatBlockedRangesCard.svelte";
	import BoatMinDurationRulesCard from "./BoatMinDurationRulesCard.svelte";
	import BoatPricingRulesCard from "./BoatPricingRulesCard.svelte";
	import BoatSlotsCard from "./BoatSlotsCard.svelte";
	import {
		areDurationsEqual,
		type BookableSlot,
		buildIdempotencyKey,
		clamp,
		formatDurationLabel,
		formatMoneyRu,
		normalizeDurationHours,
		normalizeDurationOptions,
		toLocalIsoDate,
		toSlotKey,
	} from "./boat-page-utils";

	interface CpWidget {
		start(params: Record<string, unknown>): Promise<{ success: boolean }>;
	}
	interface CpNamespace {
		CloudPayments: new () => CpWidget;
	}

	const defaultDate = toLocalIsoDate(
		new Date(Date.now() + 24 * 60 * 60 * 1000)
	);
	const sessionQuery = authClient.useSession();

	const boatId = $derived(parseBoatIdFromRef(page.params.boatRef ?? ""));
	const requestedDate = $derived(
		page.url.searchParams.get("date") ?? defaultDate
	);
	const requestedDurationHours = $derived(
		normalizeDurationHours(page.url.searchParams.get("durationHours"), 2)
	);
	const requestedPassengers = $derived(
		clamp(
			Number.parseInt(page.url.searchParams.get("passengers") ?? "2", 10) || 2,
			1,
			500
		)
	);
	const authBypassEnabled = $derived(
		dev && page.url.searchParams.get("auth") === "dev"
	);
	const signInHref = $derived.by(() => {
		const bookingPathSearchParams = new URLSearchParams(page.url.searchParams);
		bookingPathSearchParams.delete("auth");
		const bookingPathWithQuery = bookingPathSearchParams.size
			? `${page.url.pathname}?${bookingPathSearchParams.toString()}`
			: page.url.pathname;
		return `${resolve("/login")}?next=${encodeURIComponent(bookingPathWithQuery)}`;
	});
	const devBypassHref = $derived.by(() => {
		const devBypassSearchParams = new URLSearchParams(page.url.searchParams);
		devBypassSearchParams.set("auth", "dev");
		return `${page.url.pathname}?${devBypassSearchParams.toString()}`;
	});

	const hasBookingAccess = $derived(
		authBypassEnabled || Boolean($sessionQuery.data?.user)
	);
	const hasSignedInUser = $derived(Boolean($sessionQuery.data?.user));
	const resolveAuthStatusLabel = (): string => {
		if (authBypassEnabled) {
			return "Dev bypass enabled";
		}

		const user = $sessionQuery.data?.user;
		if (!user) {
			return "Sign in required";
		}

		return user.email ? `Signed in as ${user.email}` : "Signed in";
	};
	const authStatusLabel = $derived(resolveAuthStatusLabel());
	const withUpdatedSearchParams = (
		updates: Record<string, string | number>
	): string => {
		const params = new URLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(updates)) {
			params.set(key, String(value));
		}
		return `${page.url.pathname}?${params.toString()}`;
	};

	const boatDetailOpts = $derived.by(() => {
		const pageBoatId = parseBoatIdFromRef(page.params.boatRef ?? "");
		const pageRequestedDate = page.url.searchParams.get("date") ?? defaultDate;
		const pageRequestedDurationHours = normalizeDurationHours(
			page.url.searchParams.get("durationHours"),
			2
		);
		const pageRequestedPassengers = clamp(
			Number.parseInt(page.url.searchParams.get("passengers") ?? "2", 10) || 2,
			1,
			500
		);

		return {
			...orpc.booking.getByIdPublic.queryOptions({
				input: {
					boatId: pageBoatId || "missing-boat-id",
					date: pageRequestedDate,
					durationHours: pageRequestedDurationHours,
					passengers: pageRequestedPassengers,
				},
				context: {
					queryKey: [
						"booking.getByIdPublic",
						pageBoatId,
						pageRequestedDate,
						pageRequestedDurationHours,
						pageRequestedPassengers,
					],
				},
			}),
			enabled: pageBoatId.length > 0,
		};
	});
	const boatDetailOptsStore = writable(untrack(() => boatDetailOpts));
	$effect(() => {
		boatDetailOptsStore.set(boatDetailOpts);
	});
	const boatDetailQuery = createQuery(boatDetailOptsStore);

	const createPublicBookingMutation = createMutation(
		orpc.booking.createPublic.mutationOptions()
	);
	const createPaymentAttemptMutation = createMutation(
		orpc.booking.paymentAttemptCreate.mutationOptions()
	);

	let mockPaymentPendingSlotKey = $state<string | null>(null);
	let mockPaymentMessage = $state<string | null>(null);
	let mockPaymentError = $state<string | null>(null);

	let cpPendingSlotKey = $state<string | null>(null);
	let cpMessage = $state<string | null>(null);
	let cpError = $state<string | null>(null);
	const cpPublicId = publicEnv.PUBLIC_CLOUDPAYMENTS_PUBLIC_ID || undefined;

	const bookAndPayWithMock = async (slot: BookableSlot) => {
		const user = $sessionQuery.data?.user;
		if (!user) {
			mockPaymentError = "Sign in first to create a booking.";
			mockPaymentMessage = null;
			return;
		}

		const slotKey = toSlotKey(slot.startsAt, slot.endsAt);
		mockPaymentPendingSlotKey = slotKey;
		mockPaymentMessage = null;
		mockPaymentError = null;

		try {
			const bookingResult = await $createPublicBookingMutation.mutateAsync({
				boatId,
				startsAt: slot.startsAt,
				endsAt: slot.endsAt,
				passengers: requestedPassengers,
				contactName: user.name?.trim() || "Demo Customer",
				contactPhone: user.email ? undefined : "+10000000000",
				contactEmail: user.email ?? undefined,
				timezone: "UTC",
				source: "web",
				metadata: JSON.stringify({
					source: "boats-page",
					mockPayment: true,
				}),
			});

			const payNowCents = Math.max(
				bookingResult.estimatedPayNowAfterDiscountCents,
				0
			);
			const paymentInput = {
				bookingId: bookingResult.booking.id,
				idempotencyKey: buildIdempotencyKey(),
				provider: "mock",
				autoCaptureMock: true,
				currency: bookingResult.pricingQuoteAfterDiscount.currency,
				metadata: JSON.stringify({
					source: "boats-page",
					mockPayment: true,
				}),
				...(payNowCents > 0 ? { amountCents: payNowCents } : {}),
			};

			const paymentResult =
				await $createPaymentAttemptMutation.mutateAsync(paymentInput);

			mockPaymentMessage = `Mock payment ${paymentResult.paymentAttempt.status} for booking ${bookingResult.booking.id.slice(0, 8)}.`;
			await $boatDetailQuery.refetch();
		} catch (error) {
			mockPaymentError =
				error instanceof Error ? error.message : "Mock payment failed.";
		} finally {
			mockPaymentPendingSlotKey = null;
		}
	};

	const bookAndPayWithCloudPayments = async (slot: BookableSlot) => {
		const user = $sessionQuery.data?.user;
		if (!user) {
			cpError = "Sign in first to create a booking.";
			cpMessage = null;
			return;
		}
		if (!cpPublicId) {
			cpError = "CloudPayments is not configured.";
			cpMessage = null;
			return;
		}

		const slotKey = toSlotKey(slot.startsAt, slot.endsAt);
		cpPendingSlotKey = slotKey;
		cpMessage = null;
		cpError = null;

		try {
			const bookingResult = await $createPublicBookingMutation.mutateAsync({
				boatId,
				startsAt: slot.startsAt,
				endsAt: slot.endsAt,
				passengers: requestedPassengers,
				contactName: user.name?.trim() || "Customer",
				contactPhone: user.email ? undefined : "+10000000000",
				contactEmail: user.email ?? undefined,
				timezone: "UTC",
				source: "web",
			});

			const payNowCents = Math.max(
				bookingResult.estimatedPayNowAfterDiscountCents,
				0
			);
			if (payNowCents <= 0) {
				cpMessage = `Booking created — no payment needed (${bookingResult.booking.id.slice(0, 8)}).`;
				await $boatDetailQuery.refetch();
				return;
			}

			const paymentResult = await $createPaymentAttemptMutation.mutateAsync({
				bookingId: bookingResult.booking.id,
				idempotencyKey: buildIdempotencyKey(),
				provider: "cloudpayments",
				currency: bookingResult.pricingQuoteAfterDiscount.currency,
				...(payNowCents > 0 ? { amountCents: payNowCents } : {}),
			});

			const amountUnits = paymentResult.paymentAttempt.amountCents / 100;
			const widget = new (
				window as unknown as { cp: CpNamespace }
			).cp.CloudPayments();
			const widgetResult = await widget.start({
				publicTerminalId: cpPublicId,
				description: `Booking #${bookingResult.booking.id.slice(0, 8)}`,
				paymentSchema: "Single",
				currency: bookingResult.pricingQuoteAfterDiscount.currency,
				amount: amountUnits,
				externalId: bookingResult.booking.id,
				skin: "classic",
				autoClose: 7,
				culture: "ru-RU",
				receiptEmail: user.email ?? "",
				userInfo: {
					firstName: user.name ?? "",
					email: user.email ?? "",
				},
				metadata: {
					bookingId: bookingResult.booking.id,
					paymentAttemptId: paymentResult.paymentAttempt.id,
				},
			});

			if (widgetResult.success) {
				cpMessage = `Payment captured for booking ${bookingResult.booking.id.slice(0, 8)}.`;
			} else {
				cpMessage = `Payment widget closed for booking ${bookingResult.booking.id.slice(0, 8)}.`;
			}

			await $boatDetailQuery.refetch();
		} catch (error) {
			cpError = error instanceof Error ? error.message : "Payment failed.";
		} finally {
			cpPendingSlotKey = null;
		}
	};
</script>

<div class="mx-auto w-full max-w-6xl px-6 py-10">
	<div class="mb-8 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Boat Page</h1>
			<p class="text-sm text-muted-foreground">
				Generated public profile with pricing and slots.
			</p>
		</div>
		<Button href={resolve("/boats")} variant="outline">
			Back to Boat Pages
		</Button>
	</div>

	{#if boatId.length === 0}
		<p class="text-sm text-destructive">Invalid boat page reference.</p>
	{:else if $boatDetailQuery.isPending}
		<p class="text-sm text-muted-foreground">Loading boat page...</p>
	{:else if $boatDetailQuery.isError}
		<p class="text-sm text-destructive">
			Failed to generate boat page:
			{$boatDetailQuery.error?.message ?? "Unknown error"}
		</p>
	{:else if !$boatDetailQuery.data}
		<p class="text-sm text-muted-foreground">Boat not found.</p>
	{:else}
		<div class="grid gap-6 lg:grid-cols-3">
			<Card class="lg:col-span-2">
				<CardHeader>
					<CardTitle>{$boatDetailQuery.data.boat.name}</CardTitle>
					<CardDescription>{$boatDetailQuery.data.boat.slug}</CardDescription>
				</CardHeader>
				<CardContent class="space-y-3 text-sm text-muted-foreground">
					<p>
						{$boatDetailQuery.data.boat.description ?? "No boat description yet."}
					</p>
					<p>Type: {$boatDetailQuery.data.boat.type}</p>
					<p>Capacity: {$boatDetailQuery.data.boat.passengerCapacity} guests</p>
					<p>
						Minimum booking:
						{$boatDetailQuery.data.boat.minimumHours === 0
							? "No minimum"
							: `${$boatDetailQuery.data.boat.minimumHours}h`}
					</p>
					<p>
						Working hours (local):
						{$boatDetailQuery.data.boat.workingHoursStart}:00 -
						{$boatDetailQuery.data.boat.workingHoursEnd}:00
					</p>
					<p>Timezone: {$boatDetailQuery.data.boat.timezone}</p>
					{#if $boatDetailQuery.data.dock}
						<p>
							Dock: {$boatDetailQuery.data.dock.name}
							{$boatDetailQuery.data.dock.address
								? ` • ${$boatDetailQuery.data.dock.address}`
								: ""}
						</p>
					{/if}
					{#if $boatDetailQuery.data.pricingQuote}
						<p>
							Estimated total ({requestedDurationHours}h):
							{formatMoneyRu(
								$boatDetailQuery.data.pricingQuote.estimatedTotalPriceCents,
								$boatDetailQuery.data.pricingQuote.currency
							)}
						</p>
						<div class="rounded-md border border-border bg-muted/30 p-3">
							<p
								class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								Pricing Breakdown (Estimate)
							</p>
							<div class="space-y-1">
								<div class="flex items-center justify-between">
									<span>Base subtotal</span>
									<span>
										{formatMoneyRu(
											$boatDetailQuery.data.pricingQuote.estimatedBasePriceCents,
											$boatDetailQuery.data.pricingQuote.currency
										)}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span>Service fee</span>
									<span>
										{formatMoneyRu(
											$boatDetailQuery.data.pricingQuote.estimatedServiceFeeCents,
											$boatDetailQuery.data.pricingQuote.currency
										)}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span>Affiliate fee</span>
									<span>
										{formatMoneyRu(
											$boatDetailQuery.data.pricingQuote.estimatedAffiliateFeeCents,
											$boatDetailQuery.data.pricingQuote.currency
										)}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span>Pay now (platform markup)</span>
									<span>
										{formatMoneyRu(
											$boatDetailQuery.data.pricingQuote.estimatedPayNowCents,
											$boatDetailQuery.data.pricingQuote.currency
										)}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span>Owner settle (pay later)</span>
									<span>
										{formatMoneyRu(
											$boatDetailQuery.data.pricingQuote.estimatedPayLaterCents,
											$boatDetailQuery.data.pricingQuote.currency
										)}
									</span>
								</div>
								<div
									class="flex items-center justify-between font-medium text-foreground"
								>
									<span>Total</span>
									<span>
										{formatMoneyRu(
											$boatDetailQuery.data.pricingQuote.estimatedTotalPriceCents,
											$boatDetailQuery.data.pricingQuote.currency
										)}
									</span>
								</div>
							</div>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Page Inputs</CardTitle>
				</CardHeader>
				<CardContent class="space-y-2 text-sm text-muted-foreground">
					<p>Date: {requestedDate} (boat local)</p>
					<p>Duration: {formatDurationLabel(requestedDurationHours)}</p>
					<p>Passengers: {requestedPassengers}</p>
					<p>Generated slots: {$boatDetailQuery.data.slots.length}</p>
					<div class="pt-1">
						<p
							class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
						>
							Duration Presets
						</p>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each normalizeDurationOptions($boatDetailQuery.data.availableFilters.durationOptions) as durationOption}
								<Button
									size="sm"
									variant={areDurationsEqual(durationOption, requestedDurationHours)
										? "secondary"
										: "outline"}
									href={withUpdatedSearchParams({
										durationHours: durationOption,
									})}
								>
									{formatDurationLabel(durationOption)}
								</Button>
							{/each}
						</div>
					</div>
					<div class="rounded-md border border-border bg-muted/30 p-3">
						<p
							class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
						>
							Booking Access
						</p>
						<p
							class="mt-1 text-sm text-foreground"
							data-testid="booking-access-status"
						>
							{authStatusLabel}
						</p>
						{#if mockPaymentMessage}
							<p
								class="mt-2 text-xs text-primary"
								data-testid="mock-payment-message"
							>
								{mockPaymentMessage}
							</p>
						{/if}
						{#if mockPaymentError}
							<p
								class="mt-2 text-xs text-destructive"
								data-testid="mock-payment-error"
							>
								{mockPaymentError}
							</p>
						{/if}
						{#if !$sessionQuery.isPending && !hasBookingAccess}
							<div class="mt-2 flex flex-wrap gap-2">
								<Button href={signInHref} size="sm">Sign In</Button>
								{#if dev}
									<Button href={devBypassHref} size="sm" variant="outline">
										Dev Bypass
									</Button>
								{/if}
							</div>
						{/if}
					</div>
				</CardContent>
			</Card>

			<Card class="lg:col-span-3">
				<CardHeader>
					<CardTitle>Amenities</CardTitle>
				</CardHeader>
				<CardContent>
					{#if $boatDetailQuery.data.amenities.length === 0}
						<p class="text-sm text-muted-foreground">No amenities listed.</p>
					{:else}
						<div class="flex flex-wrap gap-2">
							{#each $boatDetailQuery.data.amenities as amenity (amenity.id)}
								<span
									class="rounded-full border border-border bg-muted px-3 py-1 text-xs text-foreground"
								>
									{amenity.label ?? amenity.key}
								</span>
							{/each}
						</div>
					{/if}
				</CardContent>
			</Card>

			<BoatPricingRulesCard
				rules={$boatDetailQuery.data.pricingRules}
				currency={$boatDetailQuery.data.pricingQuote?.currency ?? "RUB"}
			/>

			<BoatMinDurationRulesCard
				rules={$boatDetailQuery.data.minimumDurationRules}
			/>

			<BoatBlockedRangesCard
				blocks={$boatDetailQuery.data.availabilityBlocks}
				timezone={$boatDetailQuery.data.boat.timezone}
			/>

			<BoatSlotsCard
				slots={$boatDetailQuery.data.slots}
				timezone={$boatDetailQuery.data.boat.timezone}
				workingHoursStart={$boatDetailQuery.data.boat.workingHoursStart}
				workingHoursEnd={$boatDetailQuery.data.boat.workingHoursEnd}
				hasPricingQuote={Boolean($boatDetailQuery.data.pricingQuote)}
				{hasBookingAccess}
				{hasSignedInUser}
				sessionPending={$sessionQuery.isPending}
				{cpPublicId}
				{cpPendingSlotKey}
				{mockPaymentPendingSlotKey}
				onBookMock={(slot) => { void bookAndPayWithMock(slot); }}
				onBookCloudPayments={(slot) => { void bookAndPayWithCloudPayments(slot); }}
				{withUpdatedSearchParams}
			/>

			<Card class="lg:col-span-3">
				<CardHeader>
					<CardTitle>Gallery Assets</CardTitle>
				</CardHeader>
				<CardContent>
					{#if $boatDetailQuery.data.galleryAssets.length === 0}
						<p class="text-sm text-muted-foreground">
							No gallery assets uploaded.
						</p>
					{:else}
						<ul class="space-y-2 text-sm text-muted-foreground">
							{#each $boatDetailQuery.data.galleryAssets as asset (asset.id)}
								<li>{asset.fileName ?? asset.storageKey}</li>
							{/each}
						</ul>
					{/if}
				</CardContent>
				<CardFooter>
					<p class="text-xs text-muted-foreground">
						Asset URLs are not exposed yet; this page currently lists metadata.
					</p>
				</CardFooter>
			</Card>
		</div>
	{/if}
</div>
