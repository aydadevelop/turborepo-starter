<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@full-stack-cf-app/ui/components/card";
	import { Input } from "@full-stack-cf-app/ui/components/input";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { env as publicEnv } from "$env/dynamic/public";
	import { authClient } from "$lib/auth-client";
	import {
		formatBookingRange,
		formatDateTime,
		formatMoney,
		formatSignedMoney,
		toDateParam,
	} from "$lib/booking-format";
	import {
		affiliatePayoutStatusClass,
		bookingStatusClass,
		escalationStatusClass,
		paymentStatusClass,
		shiftStatusClass,
	} from "$lib/booking-status";
	import { orpc } from "$lib/orpc";

	interface CpWidget {
		start(params: Record<string, unknown>): Promise<{ success: boolean }>;
	}
	interface CpNamespace {
		CloudPayments: new () => CpWidget;
	}

	const sessionQuery = authClient.useSession();

	const canManageOrganizationQuery = createQuery({
		...orpc.canManageOrganization.queryOptions(),
		retry: false,
	});

	const managedBookingsQuery = createQuery({
		...orpc.booking.listManaged.queryOptions({
			input: {
				limit: 100,
				offset: 0,
				sortBy: "startsAt",
				sortOrder: "desc",
			},
		}),
		refetchInterval: 5000,
	});

	const managedCancellationRequestsQuery = createQuery(
		orpc.booking.cancellationRequestListManaged.queryOptions({
			input: { limit: 100 },
		})
	);

	const managedShiftRequestsQuery = createQuery(
		orpc.booking.shiftRequestListManaged.queryOptions({
			input: { limit: 100 },
		})
	);

	const managedAffiliatePayoutsQuery = createQuery(
		orpc.booking.affiliatePayoutListManaged.queryOptions({
			input: { limit: 100, offset: 0 },
		})
	);

	const cancelManagedBookingMutation = createMutation(
		orpc.booking.cancelManaged.mutationOptions()
	);
	const reviewCancellationRequestMutation = createMutation(
		orpc.booking.cancellationRequestReviewManaged.mutationOptions()
	);
	const reviewShiftRequestManagedMutation = createMutation(
		orpc.booking.shiftRequestReviewManaged.mutationOptions()
	);
	const processAffiliatePayoutMutation = createMutation(
		orpc.booking.affiliatePayoutProcessManaged.mutationOptions()
	);
	const paymentCreateMutation = createMutation(
		orpc.booking.paymentAttemptCreate.mutationOptions()
	);

	let bookingStatusFilter = $state("all");
	let searchTerm = $state("");
	let cancelDraftBookingId = $state<string | null>(null);
	let cancelReasonDraft = $state("Cancelled by operator");
	let cancelPendingBookingId = $state<string | null>(null);
	let reviewDraftBookingId = $state<string | null>(null);
	let reviewNoteDraft = $state("Reviewed by operator");
	let reviewPendingBookingId = $state<string | null>(null);
	let shiftReviewDraftBookingId = $state<string | null>(null);
	let shiftReviewNoteDraft = $state("Reviewed shift request");
	let shiftReviewPendingBookingId = $state<string | null>(null);
	let payoutPendingId = $state<string | null>(null);
	let payPendingBookingId = $state<string | null>(null);
	let actionMessage = $state<string | null>(null);
	let actionError = $state<string | null>(null);

	$effect(() => {
		if (!($sessionQuery.isPending || $sessionQuery.data)) {
			goto(resolve("/login"));
		}
	});

	const hasManagerAccess = $derived(
		Boolean($canManageOrganizationQuery.data?.canManageOrganization)
	);

	const bookingStatusOptions = [
		"all",
		"pending",
		"awaiting_payment",
		"confirmed",
		"in_progress",
		"completed",
		"cancelled",
		"no_show",
	] as const;

	const activeStatuses = new Set([
		"pending",
		"awaiting_payment",
		"confirmed",
		"in_progress",
	]);

	const managedBookings = $derived($managedBookingsQuery.data?.items ?? []);
	const totalBookings = $derived($managedBookingsQuery.data?.total ?? 0);
	const managedAffiliatePayouts = $derived(
		$managedAffiliatePayoutsQuery.data?.items ?? []
	);

	const pendingEscalations = $derived(
		($managedCancellationRequestsQuery.data ?? []).filter(
			(r) => r.status === "requested"
		)
	);

	const shiftRequestsNeedingReview = $derived(
		($managedShiftRequestsQuery.data ?? []).filter(
			(r) => r.status === "pending" && r.managerDecision === "pending"
		)
	);

	const activeBookingCount = $derived(
		managedBookings.filter((b) => activeStatuses.has(b.status)).length
	);

	const cancelledBookingCount = $derived(
		managedBookings.filter((b) => b.status === "cancelled").length
	);

	const escalationRequestByBookingId = $derived.by(() => {
		return new Map(
			($managedCancellationRequestsQuery.data ?? []).map((r) => [
				r.bookingId,
				r,
			])
		);
	});

	const shiftRequestByBookingId = $derived.by(() => {
		return new Map(
			($managedShiftRequestsQuery.data ?? []).map((r) => [r.bookingId, r])
		);
	});

	const filteredBookings = $derived.by(() => {
		const normalizedSearch = searchTerm.trim().toLowerCase();
		return managedBookings.filter((item) => {
			if (
				bookingStatusFilter !== "all" &&
				item.status !== bookingStatusFilter
			) {
				return false;
			}
			if (!normalizedSearch) {
				return true;
			}
			const haystack = [
				item.id,
				item.contactName ?? "",
				item.contactEmail ?? "",
				item.contactPhone ?? "",
				item.boatId,
			]
				.join(" ")
				.toLowerCase();
			return haystack.includes(normalizedSearch);
		});
	});

	const refetchAll = async () => {
		await Promise.all([
			$managedBookingsQuery.refetch(),
			$managedCancellationRequestsQuery.refetch(),
			$managedShiftRequestsQuery.refetch(),
			$managedAffiliatePayoutsQuery.refetch(),
		]);
	};

	const startCancelFlow = (bookingId: string) => {
		cancelDraftBookingId = bookingId;
		cancelReasonDraft = "Cancelled by operator";
		actionError = null;
		actionMessage = null;
	};

	const closeCancelFlow = () => {
		cancelDraftBookingId = null;
		cancelReasonDraft = "Cancelled by operator";
	};

	const confirmCancel = async (bookingId: string) => {
		cancelPendingBookingId = bookingId;
		actionError = null;
		actionMessage = null;
		try {
			await $cancelManagedBookingMutation.mutateAsync({
				bookingId,
				...(cancelReasonDraft.trim()
					? { reason: cancelReasonDraft.trim() }
					: {}),
			});
			actionMessage = `Booking ${bookingId.slice(0, 8)} cancelled.`;
			closeCancelFlow();
			await refetchAll();
		} catch (error) {
			actionError =
				error instanceof Error ? error.message : "Failed to cancel booking.";
		} finally {
			cancelPendingBookingId = null;
		}
	};

	const startEscalationReview = (bookingId: string) => {
		reviewDraftBookingId = bookingId;
		reviewNoteDraft = "Reviewed by operator";
		actionError = null;
		actionMessage = null;
	};

	const closeEscalationReview = () => {
		reviewDraftBookingId = null;
		reviewNoteDraft = "Reviewed by operator";
	};

	const reviewEscalation = async (
		bookingId: string,
		decision: "approve" | "reject"
	) => {
		reviewPendingBookingId = bookingId;
		actionError = null;
		actionMessage = null;
		try {
			await $reviewCancellationRequestMutation.mutateAsync({
				bookingId,
				decision,
				...(reviewNoteDraft.trim()
					? { reviewNote: reviewNoteDraft.trim() }
					: {}),
			});
			actionMessage = `Escalation ${decision}d for booking ${bookingId.slice(0, 8)}.`;
			closeEscalationReview();
			await refetchAll();
		} catch (error) {
			actionError =
				error instanceof Error ? error.message : "Failed to review escalation.";
		} finally {
			reviewPendingBookingId = null;
		}
	};

	const startShiftReview = (bookingId: string) => {
		shiftReviewDraftBookingId = bookingId;
		shiftReviewNoteDraft = "Reviewed shift request";
		actionError = null;
		actionMessage = null;
	};

	const closeShiftReview = () => {
		shiftReviewDraftBookingId = null;
		shiftReviewNoteDraft = "Reviewed shift request";
	};

	const reviewShiftRequest = async (
		bookingId: string,
		decision: "approve" | "reject"
	) => {
		shiftReviewPendingBookingId = bookingId;
		actionError = null;
		actionMessage = null;
		try {
			await $reviewShiftRequestManagedMutation.mutateAsync({
				bookingId,
				decision,
				...(shiftReviewNoteDraft.trim()
					? { note: shiftReviewNoteDraft.trim() }
					: {}),
			});
			actionMessage = `Shift request ${decision}d for booking ${bookingId.slice(0, 8)}.`;
			closeShiftReview();
			await refetchAll();
		} catch (error) {
			actionError =
				error instanceof Error
					? error.message
					: "Failed to review shift request.";
		} finally {
			shiftReviewPendingBookingId = null;
		}
	};

	const processAffiliatePayout = async (
		payoutId: string,
		status: "paid" | "voided"
	) => {
		payoutPendingId = payoutId;
		actionError = null;
		actionMessage = null;
		try {
			await $processAffiliatePayoutMutation.mutateAsync({
				payoutId,
				status,
				...(status === "paid"
					? { externalPayoutRef: `manual-${Date.now()}` }
					: { note: "Voided by manager" }),
			});
			actionMessage =
				status === "paid"
					? "Affiliate payout marked as paid."
					: "Affiliate payout marked as voided.";
			await refetchAll();
		} catch (error) {
			actionError =
				error instanceof Error
					? error.message
					: "Failed to process affiliate payout.";
		} finally {
			payoutPendingId = null;
		}
	};

	const canPay = (bookingItem: (typeof managedBookings)[number]): boolean => {
		if (bookingItem.status === "cancelled") {
			return false;
		}
		return (
			bookingItem.paymentStatus === "unpaid" ||
			bookingItem.paymentStatus === "partially_paid" ||
			bookingItem.paymentStatus === "failed"
		);
	};

	const startPayment = async (
		bookingItem: (typeof managedBookings)[number]
	) => {
		const cpPublicId = publicEnv.PUBLIC_CLOUDPAYMENTS_PUBLIC_ID || undefined;
		if (!cpPublicId) {
			actionError = "CloudPayments is not configured";
			return;
		}

		payPendingBookingId = bookingItem.id;
		actionError = null;
		actionMessage = null;

		try {
			const result = await $paymentCreateMutation.mutateAsync({
				bookingId: bookingItem.id,
				idempotencyKey: crypto.randomUUID(),
				provider: "cloudpayments",
				currency: bookingItem.currency,
			});

			const amountUnits = result.paymentAttempt.amountCents / 100;

			const widget = new (
				window as unknown as { cp: CpNamespace }
			).cp.CloudPayments();
			const widgetResult = await widget.start({
				publicTerminalId: cpPublicId,
				description: `Booking #${bookingItem.id.slice(0, 8)}`,
				paymentSchema: "Single",
				currency: bookingItem.currency,
				amount: amountUnits,
				externalId: bookingItem.id,
				skin: "classic",
				autoClose: 7,
				culture: "ru-RU",
				metadata: {
					bookingId: bookingItem.id,
					paymentAttemptId: result.paymentAttempt.id,
				},
			});

			if (widgetResult.success) {
				actionMessage = `Payment successful for booking #${bookingItem.id.slice(0, 8)}`;
			} else {
				actionMessage = `Payment widget closed for booking #${bookingItem.id.slice(0, 8)}`;
			}

			await refetchAll();
		} catch (error) {
			actionError = error instanceof Error ? error.message : "Payment failed";
		} finally {
			payPendingBookingId = null;
		}
	};
</script>

{#if $sessionQuery.isPending}
	<div class="flex min-h-[50vh] items-center justify-center">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if !$sessionQuery.data}
	<div class="flex min-h-[50vh] items-center justify-center">
		<p class="text-muted-foreground">Redirecting to login...</p>
	</div>
{:else if $canManageOrganizationQuery.isPending}
	<div class="flex min-h-[50vh] items-center justify-center">
		<p class="text-muted-foreground">Checking permissions...</p>
	</div>
{:else if !hasManagerAccess}
	<div class="flex min-h-[50vh] flex-col items-center justify-center gap-4">
		<p class="text-muted-foreground">
			You don't have manager access to an organization.
		</p>
		<Button variant="outline" href={resolve("/bookings")}>
			Go to My Bookings
		</Button>
	</div>
{:else}
	<div class="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
		<div class="space-y-2">
			<h1 class="text-3xl font-bold tracking-tight">Managed Bookings</h1>
			<p class="text-sm text-muted-foreground">
				Organization view: booking history, cancellation escalations, shift
				reviews, and affiliate payouts.
			</p>
		</div>

		<div class="grid gap-4 md:grid-cols-5">
			<Card>
				<CardHeader class="space-y-1 pb-2">
					<CardDescription>Total Bookings</CardDescription>
					<CardTitle class="text-2xl">{totalBookings}</CardTitle>
				</CardHeader>
			</Card>
			<Card>
				<CardHeader class="space-y-1 pb-2">
					<CardDescription>Active</CardDescription>
					<CardTitle class="text-2xl">{activeBookingCount}</CardTitle>
				</CardHeader>
			</Card>
			<Card>
				<CardHeader class="space-y-1 pb-2">
					<CardDescription>Cancelled</CardDescription>
					<CardTitle class="text-2xl">{cancelledBookingCount}</CardTitle>
				</CardHeader>
			</Card>
			<Card>
				<CardHeader class="space-y-1 pb-2">
					<CardDescription>Escalations Pending</CardDescription>
					<CardTitle class="text-2xl">{pendingEscalations.length}</CardTitle>
				</CardHeader>
			</Card>
			<Card>
				<CardHeader class="space-y-1 pb-2">
					<CardDescription>Shift Reviews Pending</CardDescription>
					<CardTitle class="text-2xl">
						{shiftRequestsNeedingReview.length}
					</CardTitle>
				</CardHeader>
			</Card>
		</div>

		{#if actionMessage}
			<p class="text-sm text-primary">{actionMessage}</p>
		{/if}
		{#if actionError}
			<p class="text-sm text-destructive">{actionError}</p>
		{/if}

		<!-- Cancellation Escalations -->
		<Card>
			<CardHeader>
				<CardTitle>Cancellation Escalations</CardTitle>
				<CardDescription>
					Review cancellation requests raised by customers.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if $managedCancellationRequestsQuery.isPending}
					<p class="text-sm text-muted-foreground">
						Loading cancellation requests...
					</p>
				{:else if $managedCancellationRequestsQuery.error}
					<p class="text-sm text-destructive">
						Failed to load cancellation requests:
						{$managedCancellationRequestsQuery.error instanceof Error
							? $managedCancellationRequestsQuery.error.message
							: "Unknown error"}
					</p>
				{:else if pendingEscalations.length === 0}
					<p class="text-sm text-muted-foreground">
						No pending cancellation escalations.
					</p>
				{:else}
					<ul class="space-y-3">
						{#each pendingEscalations as escalation (escalation.id)}
							<li class="space-y-2 rounded-md border p-3">
								<div class="flex flex-wrap items-start justify-between gap-2">
									<div>
										<p class="text-sm font-medium text-foreground">
											Booking #{escalation.bookingId.slice(0, 8)}
										</p>
										<p class="text-xs text-muted-foreground">
											Requested {formatDateTime(escalation.requestedAt)}
										</p>
										{#if escalation.reason}
											<p class="mt-1 text-sm text-muted-foreground">
												Reason: {escalation.reason}
											</p>
										{/if}
									</div>
									<span
										class={`rounded-full px-2 py-1 text-xs font-medium ${escalationStatusClass(escalation.status)}`}
									>
										{escalation.status}
									</span>
								</div>

								{#if reviewDraftBookingId === escalation.bookingId}
									<div class="flex flex-col gap-2 md:flex-row md:items-center">
										<Input
											value={reviewNoteDraft}
											oninput={(event) => {
												const target = event.target as HTMLInputElement;
												reviewNoteDraft = target.value;
											}}
											placeholder="Review note"
										/>
										<div class="flex gap-2">
											<Button
												variant="default"
												disabled={reviewPendingBookingId === escalation.bookingId}
												onclick={() =>
													void reviewEscalation(
														escalation.bookingId,
														"approve"
													)}
											>
												Approve
											</Button>
											<Button
												variant="destructive"
												disabled={reviewPendingBookingId === escalation.bookingId}
												onclick={() =>
													void reviewEscalation(
														escalation.bookingId,
														"reject"
													)}
											>
												Reject
											</Button>
											<Button
												variant="outline"
												disabled={reviewPendingBookingId === escalation.bookingId}
												onclick={closeEscalationReview}
											>
												Dismiss
											</Button>
										</div>
									</div>
								{:else}
									<Button
										size="sm"
										variant="outline"
										onclick={() =>
											startEscalationReview(escalation.bookingId)}
									>
										Review escalation
									</Button>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</CardContent>
		</Card>

		<!-- Shift Requests Review -->
		<Card>
			<CardHeader>
				<CardTitle>Shift Requests Review</CardTitle>
				<CardDescription>
					Approve/reject customer shift requests. Late slot conflicts
					auto-cancel on approval.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if $managedShiftRequestsQuery.isPending}
					<p class="text-sm text-muted-foreground">Loading shift requests...</p>
				{:else if $managedShiftRequestsQuery.error}
					<p class="text-sm text-destructive">
						Failed to load shift requests:
						{$managedShiftRequestsQuery.error instanceof Error
							? $managedShiftRequestsQuery.error.message
							: "Unknown error"}
					</p>
				{:else if ($managedShiftRequestsQuery.data ?? []).length === 0}
					<p class="text-sm text-muted-foreground">No shift requests yet.</p>
				{:else}
					<ul class="space-y-3">
						{#each $managedShiftRequestsQuery.data ?? [] as shiftRequest (shiftRequest.id)}
							<li class="space-y-2 rounded-md border p-3">
								<div class="flex flex-wrap items-start justify-between gap-2">
									<div class="space-y-1">
										<p class="text-sm font-medium text-foreground">
											Booking #{shiftRequest.bookingId.slice(0, 8)}
										</p>
										<p class="text-xs text-muted-foreground">
											Current:
											{formatBookingRange(
												shiftRequest.currentStartsAt,
												shiftRequest.currentEndsAt
											)}
										</p>
										<p class="text-xs text-muted-foreground">
											Proposed:
											{formatBookingRange(
												shiftRequest.proposedStartsAt,
												shiftRequest.proposedEndsAt
											)}
										</p>
										<p class="text-xs text-muted-foreground">
											Price delta:
											{formatSignedMoney(
												shiftRequest.priceDeltaCents,
												shiftRequest.currency
											)}
											· Pay-now delta:
											{formatSignedMoney(
												shiftRequest.payNowDeltaCents,
												shiftRequest.currency
											)}
										</p>
										{#if shiftRequest.reason}
											<p class="text-xs text-muted-foreground">
												Reason: {shiftRequest.reason}
											</p>
										{/if}
										{#if shiftRequest.rejectionReason}
											<p class="text-xs text-muted-foreground">
												Outcome: {shiftRequest.rejectionReason}
											</p>
										{/if}
										<p class="text-xs text-muted-foreground">
											Customer: {shiftRequest.customerDecision} · Manager:
											{shiftRequest.managerDecision}
										</p>
									</div>
									<span
										class={`rounded-full px-2 py-1 text-xs font-medium ${shiftStatusClass(shiftRequest.status)}`}
									>
										{shiftRequest.status}
									</span>
								</div>

								{#if shiftRequest.status === "pending" && shiftRequest.managerDecision === "pending"}
									{#if shiftReviewDraftBookingId === shiftRequest.bookingId}
										<div
											class="flex flex-col gap-2 md:flex-row md:items-center"
										>
											<Input
												value={shiftReviewNoteDraft}
												oninput={(event) => {
													const target = event.target as HTMLInputElement;
													shiftReviewNoteDraft = target.value;
												}}
												placeholder="Review note"
											/>
											<div class="flex gap-2">
												<Button
													variant="default"
													disabled={shiftReviewPendingBookingId === shiftRequest.bookingId}
													onclick={() =>
														void reviewShiftRequest(
															shiftRequest.bookingId,
															"approve"
														)}
												>
													Approve shift
												</Button>
												<Button
													variant="destructive"
													disabled={shiftReviewPendingBookingId === shiftRequest.bookingId}
													onclick={() =>
														void reviewShiftRequest(
															shiftRequest.bookingId,
															"reject"
														)}
												>
													Reject shift
												</Button>
												<Button
													variant="outline"
													disabled={shiftReviewPendingBookingId === shiftRequest.bookingId}
													onclick={closeShiftReview}
												>
													Dismiss
												</Button>
											</div>
										</div>
									{:else}
										<Button
											size="sm"
											variant="outline"
											onclick={() =>
												startShiftReview(shiftRequest.bookingId)}
										>
											Review shift
										</Button>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</CardContent>
		</Card>

		<!-- Affiliate Payout Processing -->
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Affiliate Payout Processing</CardTitle>
				<CardDescription>
					Process eligible affiliate payouts after completed bookings.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{#if $managedAffiliatePayoutsQuery.isPending}
					<p class="text-sm text-muted-foreground">
						Loading affiliate payouts...
					</p>
				{:else if $managedAffiliatePayoutsQuery.error}
					<p class="text-sm text-destructive">
						Failed to load affiliate payouts:
						{$managedAffiliatePayoutsQuery.error instanceof Error
							? $managedAffiliatePayoutsQuery.error.message
							: "Unknown error"}
					</p>
				{:else if managedAffiliatePayouts.length === 0}
					<p class="text-sm text-muted-foreground">
						No affiliate payouts found.
					</p>
				{:else}
					<ul class="space-y-3">
						{#each managedAffiliatePayouts as payout (payout.payoutId)}
							<li class="rounded-md border p-3">
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="space-y-1">
										<p class="text-sm font-medium text-foreground">
											{payout.bookingRef} · {payout.boatName}
										</p>
										<p class="text-xs text-muted-foreground">
											Affiliate: {payout.affiliateUserId}
										</p>
										<p class="text-xs text-muted-foreground">
											Referral: {payout.referralCode}
										</p>
										<p class="text-xs text-muted-foreground">
											{formatBookingRange(payout.startsAt, payout.endsAt)}
										</p>
										<p class="text-xs text-muted-foreground">
											Commission:
											{formatMoney(
												payout.commissionAmountCents,
												payout.currency
											)}
										</p>
										{#if payout.paidAt}
											<p class="text-xs text-muted-foreground">
												Paid at {formatDateTime(payout.paidAt)}
											</p>
										{:else if payout.eligibleAt}
											<p class="text-xs text-muted-foreground">
												Eligible since {formatDateTime(payout.eligibleAt)}
											</p>
										{/if}
									</div>
									<div class="flex flex-col items-end gap-2">
										<span
											class={`rounded-full px-2 py-1 text-xs font-medium ${affiliatePayoutStatusClass(payout.status)}`}
										>
											{payout.status}
										</span>
										<div class="flex gap-2">
											<Button
												size="sm"
												variant="default"
												disabled={payout.status !== "eligible" || payoutPendingId === payout.payoutId}
												onclick={() =>
													void processAffiliatePayout(
														payout.payoutId,
														"paid"
													)}
											>
												Mark paid
											</Button>
											<Button
												size="sm"
												variant="outline"
												disabled={payout.status === "paid" || payoutPendingId === payout.payoutId}
												onclick={() =>
													void processAffiliatePayout(
														payout.payoutId,
														"voided"
													)}
											>
												Void
											</Button>
										</div>
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</CardContent>
		</Card>

		<!-- Managed Booking History -->
		<Card>
			<CardHeader>
				<CardTitle>Booking History</CardTitle>
				<CardDescription>
					All organization bookings. Cancel, collect payment, or inspect status.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div
					class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
				>
					<div class="flex flex-wrap gap-2">
						{#each bookingStatusOptions as statusOption (statusOption)}
							<Button
								size="sm"
								variant={bookingStatusFilter === statusOption
									? "secondary"
									: "outline"}
								onclick={() => {
									bookingStatusFilter = statusOption;
								}}
							>
								{statusOption === "all" ? "All" : statusOption}
							</Button>
						{/each}
					</div>
					<div class="w-full md:w-80">
						<Input
							value={searchTerm}
							oninput={(event) => {
								const target = event.target as HTMLInputElement;
								searchTerm = target.value;
							}}
							placeholder="Search by booking/contact/boat id"
						/>
					</div>
				</div>

				{#if $managedBookingsQuery.isPending}
					<p class="text-sm text-muted-foreground">Loading bookings...</p>
				{:else if $managedBookingsQuery.error}
					<p class="text-sm text-destructive">
						Failed to load bookings:
						{$managedBookingsQuery.error instanceof Error
							? $managedBookingsQuery.error.message
							: "Unknown error"}
					</p>
				{:else if filteredBookings.length === 0}
					<p class="text-sm text-muted-foreground">
						No bookings matched the current filter.
					</p>
				{:else}
					<ul class="space-y-3">
						{#each filteredBookings as bookingItem (bookingItem.id)}
							{@const shiftRequest = shiftRequestByBookingId.get(bookingItem.id)}
							{@const escalation = escalationRequestByBookingId.get(bookingItem.id)}
							<li class="space-y-3 rounded-md border p-3">
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="space-y-1">
										<p class="text-sm font-medium text-foreground">
											Booking #{bookingItem.id.slice(0, 8)}
										</p>
										<p class="text-sm text-muted-foreground">
											{formatBookingRange(
												bookingItem.startsAt,
												bookingItem.endsAt
											)}
										</p>
										<p class="text-xs text-muted-foreground">
											Boat: {bookingItem.boatId}
											{bookingItem.contactName
												? ` · Contact: ${bookingItem.contactName}`
												: ""}
										</p>
										<p class="text-xs text-muted-foreground">
											Created: {formatDateTime(bookingItem.createdAt)}
										</p>
									</div>
									<div class="flex flex-wrap gap-2">
										<span
											class={`rounded-full px-2 py-1 text-xs font-medium ${bookingStatusClass(bookingItem.status)}`}
										>
											{bookingItem.status}
										</span>
										<span
											class={`rounded-full px-2 py-1 text-xs font-medium ${paymentStatusClass(bookingItem.paymentStatus)}`}
										>
											{bookingItem.paymentStatus}
										</span>
										{#if escalation}
											<span
												class={`rounded-full px-2 py-1 text-xs font-medium ${escalationStatusClass(escalation.status)}`}
											>
												Escalation: {escalation.status}
											</span>
										{/if}
										{#if shiftRequest}
											<span
												class={`rounded-full px-2 py-1 text-xs font-medium ${shiftStatusClass(shiftRequest.status)}`}
											>
												Shift: {shiftRequest.status}
											</span>
										{/if}
									</div>
								</div>

								<div
									class="grid gap-1 text-xs text-muted-foreground md:grid-cols-2"
								>
									<p>
										Total:
										{formatMoney(
											bookingItem.totalPriceCents,
											bookingItem.currency
										)}
									</p>
									<p>
										Refunded:
										{formatMoney(
											bookingItem.refundAmountCents ?? 0,
											bookingItem.currency
										)}
									</p>
									<p>Source: {bookingItem.source}</p>
									<p>Timezone: {bookingItem.timezone}</p>
								</div>

								<div class="flex flex-wrap items-center gap-2">
									<Button
										size="sm"
										variant="outline"
										href={`${resolve("/boats")}/${bookingItem.boatId}?date=${toDateParam(bookingItem.startsAt)}&durationHours=2&passengers=${bookingItem.passengers}`}
									>
										Open boat page
									</Button>

									{#if canPay(bookingItem)}
										<Button
											size="sm"
											variant="default"
											disabled={payPendingBookingId === bookingItem.id}
											onclick={() => void startPayment(bookingItem)}
										>
											{payPendingBookingId === bookingItem.id
												? "Processing..."
												: `Pay ${formatMoney(bookingItem.totalPriceCents - (bookingItem.refundAmountCents ?? 0), bookingItem.currency)}`}
										</Button>
									{/if}

									{#if bookingItem.status !== "cancelled"}
										{#if cancelDraftBookingId === bookingItem.id}
											<div
												class="flex w-full flex-col gap-2 md:max-w-xl md:flex-row"
											>
												<Input
													value={cancelReasonDraft}
													oninput={(event) => {
														const target =
															event.target as HTMLInputElement;
														cancelReasonDraft = target.value;
													}}
													placeholder="Cancellation reason"
												/>
												<div class="flex gap-2">
													<Button
														variant="destructive"
														disabled={cancelPendingBookingId === bookingItem.id}
														onclick={() =>
															void confirmCancel(bookingItem.id)}
													>
														Confirm cancel
													</Button>
													<Button
														variant="outline"
														disabled={cancelPendingBookingId === bookingItem.id}
														onclick={closeCancelFlow}
													>
														Dismiss
													</Button>
												</div>
											</div>
										{:else}
											<Button
												size="sm"
												variant="outline"
												onclick={() => startCancelFlow(bookingItem.id)}
											>
												Cancel booking
											</Button>
										{/if}
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</CardContent>
		</Card>
	</div>
{/if}
