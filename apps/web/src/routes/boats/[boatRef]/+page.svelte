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
	import { derived, get } from "svelte/store";
	import { dev } from "$app/environment";
	import { resolve } from "$app/paths";
	import { page } from "$app/stores";
	import { authClient } from "$lib/auth-client";
	import { parseBoatIdFromRef } from "$lib/boat-pages";
	import { orpc } from "$lib/orpc";

	const clamp = (value: number, min: number, max: number): number =>
		Math.min(Math.max(value, min), max);
	const roundHalf = (value: number): number => Math.round(value * 2) / 2;
	const normalizeDurationHours = (
		value: string | null,
		fallback = 2
	): number => {
		const parsed = Number.parseFloat(value ?? "");
		if (!Number.isFinite(parsed)) {
			return fallback;
		}
		return clamp(roundHalf(parsed), 0.5, 24);
	};
	const toLocalIsoDate = (value: Date): string =>
		`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
			value.getDate()
		).padStart(2, "0")}`;
	const toHourLabel = (value: number): string => `${value}`.padStart(2, "0");
	const formatDurationLabel = (value: number): string =>
		Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`;
	const formatDateTimeInZone = (value: Date, timeZone: string): string =>
		new Intl.DateTimeFormat("en-GB", {
			day: "2-digit",
			month: "short",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
			timeZone,
			timeZoneName: "short",
		}).format(value);
	const formatDateTimeIsoUtc = (value: Date): string => value.toISOString();
	const formatDateTimeUtc = (value: Date): string =>
		new Intl.DateTimeFormat("en-GB", {
			dateStyle: "medium",
			timeStyle: "short",
			timeZone: "UTC",
		}).format(value);
	const formatMoney = (cents: number, currency: string): string =>
		new Intl.NumberFormat("ru-RU", {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(cents / 100);
	const formatPricingDeltaLabel = (label: string | null): string => {
		if (!label) {
			return "—";
		}
		if (label.startsWith("+") || label.startsWith("-")) {
			return label;
		}
		return `+${label}`;
	};
	const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	const parseJsonObject = (raw: string): Record<string, unknown> => {
		try {
			const parsed = JSON.parse(raw) as unknown;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
			return {};
		} catch {
			return {};
		}
	};
	const asNumber = (value: unknown): number | null =>
		typeof value === "number" && Number.isFinite(value) ? value : null;
	const asNumberArray = (value: unknown): number[] =>
		Array.isArray(value)
			? value.filter((item): item is number => typeof item === "number")
			: [];
	const formatHourMinute = (
		hourValue: unknown,
		minuteValue: unknown,
		fallbackHour = 0
	): string => {
		const hour = asNumber(hourValue);
		const minute = asNumber(minuteValue);
		const safeHour =
			hour !== null
				? Math.max(0, Math.min(24, Math.trunc(hour)))
				: fallbackHour;
		const safeMinute =
			minute !== null ? Math.max(0, Math.min(59, Math.trunc(minute))) : 0;
		return `${toHourLabel(safeHour)}:${String(safeMinute).padStart(2, "0")}`;
	};
	type PublicPricingRule = {
		ruleType: string;
		conditionJson: string;
		adjustmentType: string;
		adjustmentValue: number;
		pricingProfileId: string | null;
	};
	const formatRuleCondition = (rule: PublicPricingRule): string => {
		const condition = parseJsonObject(rule.conditionJson);

		switch (rule.ruleType) {
			case "time_window": {
				const from = formatHourMinute(
					condition.startHour,
					condition.startMinute,
					0
				);
				const to = formatHourMinute(condition.endHour, condition.endMinute, 0);
				const days = asNumberArray(condition.daysOfWeek)
					.map(
						(day) => weekdayLabels[Math.max(0, Math.min(6, Math.trunc(day)))]
					)
					.join(", ");
				return days.length > 0
					? `${from} -> ${to} (${days})`
					: `${from} -> ${to}`;
			}
			case "duration_discount": {
				const minHours = asNumber(condition.minHours);
				const maxHours = asNumber(condition.maxHours);
				if (minHours !== null && maxHours !== null) {
					return `${minHours}h-${maxHours}h`;
				}
				if (minHours !== null) {
					return `>= ${minHours}h`;
				}
				if (maxHours !== null) {
					return `<= ${maxHours}h`;
				}
				return "Any duration";
			}
			case "passenger_surcharge": {
				const includedPassengers = asNumber(condition.includedPassengers);
				return includedPassengers !== null
					? `Above ${Math.trunc(includedPassengers)} passengers`
					: "Passenger threshold";
			}
			case "weekend_surcharge": {
				const weekendDays = asNumberArray(condition.weekendDays);
				if (weekendDays.length === 0) {
					return "Weekend";
				}
				return weekendDays
					.map(
						(day) => weekdayLabels[Math.max(0, Math.min(6, Math.trunc(day)))]
					)
					.join(", ");
			}
			case "holiday_surcharge":
				return "Holiday calendar";
			case "custom":
				return Object.keys(condition).length > 0
					? JSON.stringify(condition)
					: "Custom condition";
			default:
				return Object.keys(condition).length > 0
					? JSON.stringify(condition)
					: "n/a";
		}
	};
	const formatRuleAdjustment = (
		rule: Pick<PublicPricingRule, "adjustmentType" | "adjustmentValue">,
		currency: string
	): string => {
		let sign = "";
		if (rule.adjustmentValue > 0) {
			sign = "+";
		} else if (rule.adjustmentValue < 0) {
			sign = "-";
		}
		const absValue = Math.abs(rule.adjustmentValue);
		if (rule.adjustmentType === "percentage") {
			return `${sign}${absValue}%`;
		}
		return `${sign}${formatMoney(absValue, currency)}`;
	};
	const toSlotKey = (startsAt: Date, endsAt: Date): string =>
		`${startsAt.toISOString()}-${endsAt.toISOString()}`;
	const areDurationsEqual = (left: number, right: number): boolean =>
		Math.abs(left - right) < 0.001;
	const normalizeDurationOptions = (values: number[]): number[] => {
		const fromApi = values
			.map((value) => clamp(roundHalf(value), 0.5, 24))
			.filter((value) => Number.isFinite(value));
		const merged = fromApi.length > 0 ? fromApi : [1, 1.5, 2, 3, 4];
		return Array.from(new Set(merged)).sort((a, b) => a - b);
	};
	const buildIdempotencyKey = (): string =>
		`mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	type BookableSlot = {
		startsAt: Date;
		endsAt: Date;
	};

	const defaultDate = toLocalIsoDate(
		new Date(Date.now() + 24 * 60 * 60 * 1000)
	);
	const sessionQuery = authClient.useSession();

	let boatId = $state("");
	let requestedDate = $state(defaultDate);
	let requestedDurationHours = $state(2);
	let requestedPassengers = $state(2);
	let authBypassEnabled = $state(false);
	let signInHref: string = $state(resolve("/login"));
	let devBypassHref = $state("");

	$effect(() => {
		const currentPage = $page;
		boatId = parseBoatIdFromRef(currentPage.params.boatRef ?? "");
		requestedDate = currentPage.url.searchParams.get("date") ?? defaultDate;
		requestedDurationHours = normalizeDurationHours(
			currentPage.url.searchParams.get("durationHours"),
			2
		);
		requestedPassengers = clamp(
			Number.parseInt(
				currentPage.url.searchParams.get("passengers") ?? "2",
				10
			) || 2,
			1,
			500
		);
		authBypassEnabled =
			dev && currentPage.url.searchParams.get("auth") === "dev";

		const bookingPathSearchParams = new URLSearchParams(
			currentPage.url.searchParams
		);
		bookingPathSearchParams.delete("auth");
		const bookingPathWithQuery = bookingPathSearchParams.size
			? `${currentPage.url.pathname}?${bookingPathSearchParams.toString()}`
			: currentPage.url.pathname;
		signInHref = `${resolve("/login")}?next=${encodeURIComponent(bookingPathWithQuery)}`;

		const devBypassSearchParams = new URLSearchParams(
			currentPage.url.searchParams
		);
		devBypassSearchParams.set("auth", "dev");
		devBypassHref = `${currentPage.url.pathname}?${devBypassSearchParams.toString()}`;
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
		const currentPage = get(page);
		const params = new URLSearchParams(currentPage.url.searchParams);
		for (const [key, value] of Object.entries(updates)) {
			params.set(key, String(value));
		}
		return `${currentPage.url.pathname}?${params.toString()}`;
	};

	const boatDetailQueryOptions = derived(page, ($page) => {
		const pageBoatId = parseBoatIdFromRef($page.params.boatRef ?? "");
		const pageRequestedDate = $page.url.searchParams.get("date") ?? defaultDate;
		const pageRequestedDurationHours = normalizeDurationHours(
			$page.url.searchParams.get("durationHours"),
			2
		);
		const pageRequestedPassengers = clamp(
			Number.parseInt($page.url.searchParams.get("passengers") ?? "2", 10) || 2,
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

	const boatDetailQuery = createQuery(boatDetailQueryOptions);

	const createPublicBookingMutation = createMutation(
		orpc.booking.createPublic.mutationOptions()
	);
	const createPaymentAttemptMutation = createMutation(
		orpc.booking.paymentAttemptCreate.mutationOptions()
	);

	let mockPaymentPendingSlotKey = $state<string | null>(null);
	let mockPaymentMessage = $state<string | null>(null);
	let mockPaymentError = $state<string | null>(null);

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
							{formatMoney(
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
										{formatMoney(
											$boatDetailQuery.data.pricingQuote.estimatedBasePriceCents,
											$boatDetailQuery.data.pricingQuote.currency
										)}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span>Service fee</span>
									<span>
										{formatMoney(
											$boatDetailQuery.data.pricingQuote.estimatedServiceFeeCents,
											$boatDetailQuery.data.pricingQuote.currency
										)}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span>Affiliate fee</span>
									<span>
										{formatMoney(
											$boatDetailQuery.data.pricingQuote.estimatedAffiliateFeeCents,
											$boatDetailQuery.data.pricingQuote.currency
										)}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span>Pay now (platform markup)</span>
									<span>
										{formatMoney(
											$boatDetailQuery.data.pricingQuote.estimatedPayNowCents,
											$boatDetailQuery.data.pricingQuote.currency
										)}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span>Owner settle (pay later)</span>
									<span>
										{formatMoney(
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
										{formatMoney(
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
						<p class="mt-1 text-sm text-foreground">{authStatusLabel}</p>
						{#if mockPaymentMessage}
							<p class="mt-2 text-xs text-primary">{mockPaymentMessage}</p>
						{/if}
						{#if mockPaymentError}
							<p class="mt-2 text-xs text-destructive">{mockPaymentError}</p>
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

			<Card class="lg:col-span-3">
				<CardHeader>
					<CardTitle>Pricing Rules</CardTitle>
					<CardDescription>
						Active pricing rules for this boat/date window.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{#if $boatDetailQuery.data.pricingRules.length === 0}
						<p class="text-sm text-muted-foreground">
							No active pricing rules for this date.
						</p>
					{:else}
						<div class="overflow-x-auto">
							<table class="w-full min-w-[900px] text-left text-sm">
								<thead class="text-muted-foreground">
									<tr class="border-b border-border">
										<th class="py-2">Name</th>
										<th class="py-2">Type</th>
										<th class="py-2">Scope</th>
										<th class="py-2">Condition</th>
										<th class="py-2">Adjustment</th>
										<th class="py-2">Priority</th>
									</tr>
								</thead>
								<tbody>
									{#each $boatDetailQuery.data.pricingRules as rule (rule.id)}
										<tr class="border-b border-border/50">
											<td class="py-2 font-medium text-foreground">
												{rule.name}
											</td>
											<td class="py-2">{rule.ruleType}</td>
											<td class="py-2">
												{rule.pricingProfileId ? "Profile" : "Global"}
											</td>
											<td class="py-2">{formatRuleCondition(rule)}</td>
											<td class="py-2">
												{formatRuleAdjustment(
													rule,
													$boatDetailQuery.data.pricingQuote?.currency ?? "RUB"
												)}
											</td>
											<td class="py-2">{rule.priority}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card class="lg:col-span-3">
				<CardHeader>
					<CardTitle>Minimum Duration Rules</CardTitle>
					<CardDescription>
						Time windows that require longer minimum bookings.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{#if $boatDetailQuery.data.minimumDurationRules.length === 0}
						<p class="text-sm text-muted-foreground">
							No minimum duration rules configured.
						</p>
					{:else}
						<div class="overflow-x-auto">
							<table class="w-full min-w-[700px] text-left text-sm">
								<thead class="text-muted-foreground">
									<tr class="border-b border-border">
										<th class="py-2">Name</th>
										<th class="py-2">Window (Local)</th>
										<th class="py-2">Min Duration</th>
										<th class="py-2">Days</th>
										<th class="py-2">Active</th>
									</tr>
								</thead>
								<tbody>
									{#each $boatDetailQuery.data.minimumDurationRules as rule (rule.id)}
										<tr class="border-b border-border/50">
											<td class="py-2 font-medium text-foreground">
												{rule.name}
											</td>
											<td class="py-2">
												{formatHourMinute(rule.startHour, rule.startMinute, 0)}→
												{formatHourMinute(rule.endHour, rule.endMinute, 0)}
											</td>
											<td class="py-2">
												{rule.minimumDurationMinutes >= 60
													? `${(rule.minimumDurationMinutes / 60).toFixed(
															rule.minimumDurationMinutes % 60 === 0 ? 0 : 1
														)}h`
													: `${rule.minimumDurationMinutes}m`}
											</td>
											<td class="py-2">
												{#if rule.daysOfWeek && Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0}
													{rule.daysOfWeek
														.map(
															(d) =>
																weekdayLabels[
																	Math.max(0, Math.min(6, Math.trunc(d as number)))
																]
														)
														.join(", ")}
												{:else}
													Every day
												{/if}
											</td>
											<td class="py-2">{rule.isActive ? "✓" : "✗"}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card class="lg:col-span-3">
				<CardHeader>
					<CardTitle>Available Slots</CardTitle>
					<CardDescription>
						Boat local timestamps ({$boatDetailQuery.data.boat.timezone}),
						working window
						{toHourLabel($boatDetailQuery.data.boat.workingHoursStart)}:00-
						{toHourLabel($boatDetailQuery.data.boat.workingHoursEnd)}:00.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{#if !$sessionQuery.isPending && !hasBookingAccess}
						<p class="mb-3 text-xs text-muted-foreground">
							Slots are visible publicly. Booking actions should require
							sign-in.
						</p>
					{/if}
					{#if $boatDetailQuery.data.slots.length > 0}
						{@const firstSlot = $boatDetailQuery.data.slots[0]}
						{@const lastSlot =
							$boatDetailQuery.data.slots[
								$boatDetailQuery.data.slots.length - 1
							]}
						<p class="mb-3 text-xs text-muted-foreground">
							Generated slot window (local):
							{formatDateTimeInZone(
								firstSlot.startsAt,
								$boatDetailQuery.data.boat.timezone
							)}
							→
							{formatDateTimeInZone(
								lastSlot.endsAt,
								$boatDetailQuery.data.boat.timezone
							)}
						</p>
					{/if}
					{#if $boatDetailQuery.data.slots.length === 0}
						<p class="text-sm text-muted-foreground">
							No slots available for this date and duration.
						</p>
						{#if !$boatDetailQuery.data.pricingQuote}
							<p class="mt-2 text-xs text-muted-foreground">
								No active pricing profile for this date, so slots cannot be
								generated.
							</p>
						{/if}
					{:else}
						<div class="overflow-x-auto">
							<table class="w-full min-w-[1300px] text-left text-sm">
								<thead class="text-muted-foreground">
									<tr class="border-b border-border">
										<th class="py-2">Start (Local)</th>
										<th class="py-2">End (Local)</th>
										<th class="py-2">Start (UTC ISO)</th>
										<th class="py-2">End (UTC ISO)</th>
										<th class="py-2">Duration</th>
										<th class="py-2">Billed</th>
										<th class="py-2">Subtotal</th>
										<th class="py-2">Markup</th>
										<th class="py-2">Total</th>
										<th class="py-2">Pay Now</th>
										<th class="py-2">Owner Settle</th>
										<th class="py-2">Delta</th>
										<th class="py-2">Action</th>
									</tr>
								</thead>
								<tbody>
									{#each $boatDetailQuery.data.slots as slot}
										<tr
											class="border-b border-border/50"
											class:opacity-50={!slot.meetsMinimumDuration}
										>
											<td class="py-2">
												<div>
													{formatDateTimeInZone(
															slot.startsAt,
															$boatDetailQuery.data.boat.timezone
														)}
												</div>
												<div class="text-xs text-muted-foreground">
													{formatDateTimeUtc(slot.startsAt)} UTC
												</div>
											</td>
											<td class="py-2">
												<div>
													{formatDateTimeInZone(
															slot.endsAt,
															$boatDetailQuery.data.boat.timezone
														)}
												</div>
												<div class="text-xs text-muted-foreground">
													{formatDateTimeUtc(slot.endsAt)} UTC
												</div>
											</td>
											<td class="py-2 font-mono text-xs">
												{formatDateTimeIsoUtc(slot.startsAt)}
											</td>
											<td class="py-2 font-mono text-xs">
												{formatDateTimeIsoUtc(slot.endsAt)}
											</td>
											<td class="py-2">
												{slot.durationMinutes} min
												{#if !slot.meetsMinimumDuration}
													<span
														class="ml-1 inline-block rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
													>
														min
														{formatDurationLabel(slot.requiredMinimumDurationMinutes / 60)}
													</span>
												{/if}
											</td>
											<td class="py-2">
												{formatDurationLabel(slot.estimatedHours)}
											</td>
											<td class="py-2">
												{formatMoney(slot.subtotalCents, slot.currency)}
											</td>
											<td class="py-2">
												{formatMoney(
														slot.totalPriceCents - slot.subtotalCents,
														slot.currency
													)}
											</td>
											<td class="py-2">
												{formatMoney(slot.totalPriceCents, slot.currency)}
											</td>
											<td class="py-2">
												{formatMoney(slot.payNowCents, slot.currency)}
											</td>
											<td class="py-2">
												{formatMoney(slot.payLaterCents, slot.currency)}
											</td>
											<td class="py-2">
												{formatPricingDeltaLabel(slot.discountLabel)}
											</td>
											<td class="py-2">
												{#if !slot.meetsMinimumDuration}
													<a
														href={withUpdatedSearchParams({
															durationHours: slot.requiredMinimumDurationMinutes / 60,
														})}
														class="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
													>
														View from
														{formatDurationLabel(slot.requiredMinimumDurationMinutes / 60)}
													</a>
												{:else if hasSignedInUser}
													<Button
														size="sm"
														variant="outline"
														disabled={Boolean(mockPaymentPendingSlotKey)}
														onclick={() => {
																void bookAndPayWithMock(slot);
															}}
													>
														{mockPaymentPendingSlotKey ===
															slot.startsAt.toISOString() +
																"-" +
																slot.endsAt.toISOString()
																? "Processing..."
																: "Book & Mock Pay"}
													</Button>
												{:else}
													<span class="text-xs text-muted-foreground">
														Sign in to book
													</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</CardContent>
			</Card>

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
