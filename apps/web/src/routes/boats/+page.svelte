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
	import { createQuery } from "@tanstack/svelte-query";
	import { derived } from "svelte/store";
	import { resolve } from "$app/paths";
	import { page } from "$app/stores";
	import { buildBoatPageRef } from "$lib/boat-pages";
	import { orpc } from "$lib/orpc";

	const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;
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
	const formatMoney = (cents: number, currency: string): string =>
		new Intl.NumberFormat("ru-RU", {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(cents / 100);

	const defaultDate = toLocalIsoDate(
		new Date(Date.now() + 24 * 60 * 60 * 1000)
	);

	type BoatsSearchState = {
		date: string;
		startHour: number;
		durationHours: number;
		passengers: number;
		startsAt: Date;
		endsAt: Date;
		availabilityWindowLabel: string;
	};

	const parseBoatsSearchState = (
		searchParams: URLSearchParams
	): BoatsSearchState => {
		const requestedDateParam = searchParams.get("date");
		const parsedDate =
			requestedDateParam && DATE_PARAM_RE.test(requestedDateParam)
				? requestedDateParam
				: defaultDate;
		const parsedStartHour = clamp(
			Number.parseInt(searchParams.get("startHour") ?? "10", 10) || 10,
			0,
			23
		);
		const parsedDurationHours = clamp(
			normalizeDurationHours(searchParams.get("durationHours"), 2),
			0.5,
			24
		);
		const parsedPassengers = clamp(
			Number.parseInt(searchParams.get("passengers") ?? "2", 10) || 2,
			1,
			500
		);
		const parsedStartsAt = new Date(
			`${parsedDate}T${toHourLabel(parsedStartHour)}:00:00`
		);
		const parsedEndsAt = new Date(
			parsedStartsAt.getTime() + parsedDurationHours * 60 * 60 * 1000
		);
		const parsedAvailabilityWindowLabel = `${parsedDate} ${toHourLabel(
			parsedStartHour
		)}:00-${toHourLabel(parsedEndsAt.getHours())}:00 local`;

		return {
			date: parsedDate,
			startHour: parsedStartHour,
			durationHours: parsedDurationHours,
			passengers: parsedPassengers,
			startsAt: parsedStartsAt,
			endsAt: parsedEndsAt,
			availabilityWindowLabel: parsedAvailabilityWindowLabel,
		};
	};

	let date = defaultDate;
	let startHour = 10;
	let durationHours = 2;
	let passengers = 2;
	let startsAt = new Date(`${date}T${toHourLabel(startHour)}:00:00`);
	let endsAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);
	let availabilityWindowLabel = `${date} ${toHourLabel(startHour)}:00-${toHourLabel(
		endsAt.getHours()
	)}:00 local`;

	$: {
		const parsed = parseBoatsSearchState($page.url.searchParams);
		date = parsed.date;
		startHour = parsed.startHour;
		durationHours = parsed.durationHours;
		passengers = parsed.passengers;
		startsAt = parsed.startsAt;
		endsAt = parsed.endsAt;
		availabilityWindowLabel = parsed.availabilityWindowLabel;
	}

	const toBoatsQueryHref = (
		valueDate: string,
		valueStartHour: number,
		valueDurationHours: number,
		valuePassengers: number
	): string => {
		const params = new URLSearchParams({
			date: valueDate,
			startHour: String(valueStartHour),
			durationHours: String(valueDurationHours),
			passengers: String(valuePassengers),
		});
		return `${resolve("/boats")}?${params.toString()}`;
	};

	const availabilityQueryOptions = derived(page, ($page) => {
		const parsed = parseBoatsSearchState($page.url.searchParams);
		return orpc.booking.availabilityPublic.queryOptions({
			input: {
				startsAt: parsed.startsAt,
				endsAt: parsed.endsAt,
				passengers: parsed.passengers,
				includeUnavailable: true,
				sortBy: "newest",
				limit: 30,
				offset: 0,
			},
			context: {
				queryKey: [
					"booking.availabilityPublic",
					parsed.startsAt.toISOString(),
					parsed.endsAt.toISOString(),
					parsed.passengers,
				],
			},
		});
	});

	const availabilityQuery = createQuery(availabilityQueryOptions);

	const toBoatDetailsHref = (boatId: string, boatSlug: string): string => {
		const boatRef = buildBoatPageRef(boatId, boatSlug);
		const params = new URLSearchParams({
			date,
			durationHours: String(durationHours),
			passengers: String(passengers),
		});
		return `${resolve("/boats")}/${boatRef}?${params.toString()}`;
	};
</script>

<div class="mx-auto w-full max-w-6xl px-6 py-10">
	<div class="mb-8 space-y-2">
		<h1 class="text-3xl font-bold tracking-tight">Boat Pages</h1>
		<p class="text-sm text-muted-foreground">
			Generated from public availability for {availabilityWindowLabel}.
		</p>
		<div class="flex flex-wrap gap-2 pt-2">
			<Button
				href={toBoatsQueryHref(date, startHour, 1, passengers)}
				variant={durationHours === 1 ? "secondary" : "outline"}
			>
				1h
			</Button>
			<Button
				href={toBoatsQueryHref(date, startHour, 2, passengers)}
				variant={durationHours === 2 ? "secondary" : "outline"}
			>
				2h
			</Button>
			<Button
				href={toBoatsQueryHref(date, startHour, 3, passengers)}
				variant={durationHours === 3 ? "secondary" : "outline"}
			>
				3h
			</Button>
			<Button
				href={toBoatsQueryHref(date, startHour, 4, passengers)}
				variant={durationHours === 4 ? "secondary" : "outline"}
			>
				4h
			</Button>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button href={toBoatsQueryHref("2026-03-16", 10, 2, 2)} variant="outline">
				Seed: Aurora booked
			</Button>
			<Button href={toBoatsQueryHref("2026-03-17", 19, 2, 2)} variant="outline">
				Seed: Odyssey booking overlap
			</Button>
			<Button href={toBoatsQueryHref("2026-03-18", 10, 2, 2)} variant="outline">
				Seed: Odyssey maintenance block
			</Button>
			<Button href={toBoatsQueryHref("2026-03-18", 21, 3, 4)} variant="outline">
				Seed: Night shift surcharge
			</Button>
		</div>
	</div>

	{#if $availabilityQuery.isPending}
		<p class="text-sm text-muted-foreground">Loading boats...</p>
	{:else if $availabilityQuery.isError}
		<p class="text-sm text-destructive">
			Failed to load boats:
			{$availabilityQuery.error?.message ?? "Unknown error"}
		</p>
	{:else if ($availabilityQuery.data?.items?.length ?? 0) === 0}
		<p class="text-sm text-muted-foreground">No boats found for this window.</p>
	{:else}
		<p class="mb-4 text-sm text-muted-foreground">
			{$availabilityQuery.data?.total ?? 0} boats found
		</p>
		<div class="grid gap-4 md:grid-cols-2">
			{#each $availabilityQuery.data?.items ?? [] as item (item.boat.id)}
				<Card>
					<CardHeader>
						<div class="flex items-start justify-between gap-3">
							<div>
								<CardTitle>{item.boat.name}</CardTitle>
								<CardDescription>
									/boats/{buildBoatPageRef(item.boat.id, item.boat.slug)}
								</CardDescription>
							</div>
							<span
								class={item.available
									? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700"
									: "rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700"}
							>
								{item.available ? "Available" : "Blocked"}
							</span>
						</div>
					</CardHeader>
					<CardContent class="space-y-1 text-sm text-muted-foreground">
						<p>Type: {item.boat.type}</p>
						<p>Capacity: {item.boat.passengerCapacity} guests</p>
						<p>Timezone: {item.boat.timezone}</p>
						<p>
							Working hours:
							{toHourLabel(item.boat.workingHoursStart)}:00-
							{toHourLabel(item.boat.workingHoursEnd)}:00 local
						</p>
						<p>
							Estimated total:
							{formatMoney(
									item.pricingQuote.estimatedTotalPriceCents,
									item.pricingQuote.currency
								)}
						</p>
						<p>
							Base subtotal:
							{formatMoney(
									item.pricingQuote.estimatedBasePriceCents,
									item.pricingQuote.currency
								)}
						</p>
						<p>
							Service fee:
							{formatMoney(
									item.pricingQuote.estimatedServiceFeeCents,
									item.pricingQuote.currency
								)}
						</p>
						<p>
							Affiliate fee:
							{formatMoney(
									item.pricingQuote.estimatedAffiliateFeeCents,
									item.pricingQuote.currency
								)}
						</p>
						<p>
							Owner settle:
							{formatMoney(
									item.pricingQuote.estimatedPayLaterCents,
									item.pricingQuote.currency
								)}
						</p>
						<p>
							Pay now (platform markup):
							{formatMoney(
									item.pricingQuote.estimatedPayNowCents,
									item.pricingQuote.currency
								)}
						</p>
						<p>Duration: {formatDurationLabel(durationHours)}</p>
					</CardContent>
					<CardFooter>
						<Button href={toBoatDetailsHref(item.boat.id, item.boat.slug)}>
							Open Boat Page
						</Button>
					</CardFooter>
				</Card>
			{/each}
		</div>
	{/if}
</div>
