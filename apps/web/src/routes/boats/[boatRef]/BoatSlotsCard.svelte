<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@full-stack-cf-app/ui/components/card";
	import {
		type BookableSlot,
		formatDateTimeInZone,
		formatDateTimeIsoUtc,
		formatDateTimeUtc,
		formatDurationLabel,
		formatMoneyRu,
		formatPricingDeltaLabel,
		toHourLabel,
		toSlotKey,
	} from "./boat-page-utils";

	interface SlotItem {
		startsAt: Date;
		endsAt: Date;
		durationMinutes: number;
		estimatedHours: number;
		subtotalCents: number;
		totalPriceCents: number;
		payNowCents: number;
		payLaterCents: number;
		currency: string;
		discountLabel: string | null;
		meetsMinimumDuration: boolean;
		requiredMinimumDurationMinutes: number;
	}

	interface Props {
		slots: SlotItem[];
		timezone: string;
		workingHoursStart: number;
		workingHoursEnd: number;
		hasPricingQuote: boolean;
		hasBookingAccess: boolean;
		hasSignedInUser: boolean;
		sessionPending: boolean;
		cpPublicId: string | undefined;
		cpPendingSlotKey: string | null;
		mockPaymentPendingSlotKey: string | null;
		onBookMock: (slot: BookableSlot) => void;
		onBookCloudPayments: (slot: BookableSlot) => void;
		withUpdatedSearchParams: (
			updates: Record<string, string | number>
		) => string;
	}

	const {
		slots,
		timezone,
		workingHoursStart,
		workingHoursEnd,
		hasPricingQuote,
		hasBookingAccess,
		hasSignedInUser,
		sessionPending,
		cpPublicId,
		cpPendingSlotKey,
		mockPaymentPendingSlotKey,
		onBookMock,
		onBookCloudPayments,
		withUpdatedSearchParams,
	}: Props = $props();
</script>

<Card class="lg:col-span-3">
	<CardHeader>
		<CardTitle>Available Slots</CardTitle>
		<CardDescription>
			Boat local timestamps ({timezone}), working window
			{toHourLabel(workingHoursStart)}:00-
			{toHourLabel(workingHoursEnd)}:00.
		</CardDescription>
	</CardHeader>
	<CardContent>
		{#if !sessionPending && !hasBookingAccess}
			<p class="mb-3 text-xs text-muted-foreground">
				Slots are visible publicly. Booking actions should require sign-in.
			</p>
		{/if}
		{#if slots.length > 0}
			{@const firstSlot = slots[0]}
			{@const lastSlot = slots[slots.length - 1]}
			<p class="mb-3 text-xs text-muted-foreground">
				Generated slot window (local):
				{formatDateTimeInZone(firstSlot.startsAt, timezone)}→
				{formatDateTimeInZone(lastSlot.endsAt, timezone)}
			</p>
		{/if}
		{#if slots.length === 0}
			<p class="text-sm text-muted-foreground">
				No slots available for this date and duration.
			</p>
			{#if !hasPricingQuote}
				<p class="mt-2 text-xs text-muted-foreground">
					No active pricing profile for this date, so slots cannot be generated.
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
						{#each slots as slot}
							<tr
								class="border-b border-border/50"
								class:opacity-50={!slot.meetsMinimumDuration}
							>
								<td class="py-2">
									<div>{formatDateTimeInZone(slot.startsAt, timezone)}</div>
									<div class="text-xs text-muted-foreground">
										{formatDateTimeUtc(slot.startsAt)} UTC
									</div>
								</td>
								<td class="py-2">
									<div>{formatDateTimeInZone(slot.endsAt, timezone)}</div>
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
								<td class="py-2">{formatDurationLabel(slot.estimatedHours)}</td>
								<td class="py-2">
									{formatMoneyRu(slot.subtotalCents, slot.currency)}
								</td>
								<td class="py-2">
									{formatMoneyRu(
										slot.totalPriceCents - slot.subtotalCents,
										slot.currency,
									)}
								</td>
								<td class="py-2">
									{formatMoneyRu(slot.totalPriceCents, slot.currency)}
								</td>
								<td class="py-2">
									{formatMoneyRu(slot.payNowCents, slot.currency)}
								</td>
								<td class="py-2">
									{formatMoneyRu(slot.payLaterCents, slot.currency)}
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
										<div class="flex gap-1">
											{#if cpPublicId}
												<Button
													size="sm"
													data-testid="cp-pay-button"
													disabled={Boolean(cpPendingSlotKey || mockPaymentPendingSlotKey)}
													onclick={() => {
														onBookCloudPayments(slot);
													}}
												>
													{cpPendingSlotKey === toSlotKey(slot.startsAt, slot.endsAt)
														? "Processing..."
														: "Book & Pay"}
												</Button>
											{/if}
											<Button
												size="sm"
												variant="outline"
												data-testid="mock-pay-button"
												disabled={Boolean(mockPaymentPendingSlotKey || cpPendingSlotKey)}
												onclick={() => {
													onBookMock(slot);
												}}
											>
												{mockPaymentPendingSlotKey === toSlotKey(slot.startsAt, slot.endsAt)
													? "Processing..."
													: "Book & Mock Pay"}
											</Button>
										</div>
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
