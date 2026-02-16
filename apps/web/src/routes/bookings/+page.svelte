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
	import { PUBLIC_CLOUDPAYMENTS_PUBLIC_ID } from "$env/static/public";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { authClient } from "$lib/auth-client";
	import { orpc } from "$lib/orpc";

	interface CpWidget {
		start(params: Record<string, unknown>): Promise<{ success: boolean }>;
	}
	interface CpNamespace {
		CloudPayments: new () => CpWidget;
	}

	const sessionQuery = authClient.useSession();
	const HOUR_MS = 60 * 60 * 1000;
	const BOOKING_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

	const mineBookingsQuery = createQuery({
		...orpc.booking.listMine.queryOptions({
			input: {
				limit: 100,
				offset: 0,
				sortBy: "startsAt",
				sortOrder: "desc",
			},
		}),
		refetchInterval: 5000,
	});

	const myCancellationRequestsQuery = createQuery(
		orpc.booking.cancellationRequestListMine.queryOptions({
			input: { limit: 100 },
		})
	);

	const myShiftRequestsQuery = createQuery(
		orpc.booking.shiftRequestListMine.queryOptions({
			input: { limit: 100 },
		})
	);

	const myDisputesQuery = createQuery(
		orpc.booking.disputeListMine.queryOptions({
			input: { limit: 100 },
		})
	);

	const myRefundsQuery = createQuery(
		orpc.booking.refundListMine.queryOptions({
			input: { limit: 100 },
		})
	);

	const myPaymentAttemptsQuery = createQuery({
		...orpc.booking.paymentAttemptListMine.queryOptions({
			input: { limit: 100 },
		}),
		refetchInterval: 5000,
	});

	const myAffiliateBookingsQuery = createQuery(
		orpc.booking.listAffiliateMine.queryOptions({
			input: {
				limit: 100,
				offset: 0,
				sortBy: "startsAt",
				sortOrder: "desc",
			},
		})
	);

	const requestCancellationMutation = createMutation(
		orpc.booking.cancellationRequestCreate.mutationOptions()
	);
	const createShiftRequestMutation = createMutation(
		orpc.booking.shiftRequestCreate.mutationOptions()
	);
	const reviewShiftRequestMineMutation = createMutation(
		orpc.booking.shiftRequestReviewMine.mutationOptions()
	);
	const paymentCreateMutation = createMutation(
		orpc.booking.paymentAttemptCreate.mutationOptions()
	);

	let bookingStatusFilter = $state("all");
	let searchTerm = $state("");
	let cancelDraftBookingId = $state<string | null>(null);
	let cancelReasonDraft = $state("Please cancel this booking");
	let cancelPendingBookingId = $state<string | null>(null);
	let shiftDraftBookingId = $state<string | null>(null);
	let shiftDraftStartsAt = $state("");
	let shiftDraftEndsAt = $state("");
	let shiftDraftPassengers = $state("1");
	let shiftReasonDraft = $state("Please shift this booking");
	let shiftPendingBookingId = $state<string | null>(null);
	let shiftReviewDraftBookingId = $state<string | null>(null);
	let shiftReviewNoteDraft = $state("Reviewed shift request");
	let shiftReviewPendingBookingId = $state<string | null>(null);
	let payPendingBookingId = $state<string | null>(null);
	let actionMessage = $state<string | null>(null);
	let actionError = $state<string | null>(null);

	$effect(() => {
		if (!($sessionQuery.isPending || $sessionQuery.data)) {
			goto(resolve("/login"));
		}
	});

	const toDate = (value: Date | string): Date =>
		value instanceof Date ? value : new Date(value);

	const formatBookingRange = (
		startsAt: Date | string,
		endsAt: Date | string
	): string => {
		const start = toDate(startsAt);
		const end = toDate(endsAt);
		return `${new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(start)} - ${new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(end)}`;
	};

	const formatDateTime = (value: Date | string): string => {
		const date = toDate(value);
		return new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(date);
	};

	const formatMoney = (amountCents: number, currency: string): string =>
		new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			maximumFractionDigits: 2,
		}).format(amountCents / 100);

	const formatSignedMoney = (amountCents: number, currency: string): string => {
		let sign = "";
		if (amountCents > 0) {
			sign = "+";
		} else if (amountCents < 0) {
			sign = "-";
		}
		return `${sign}${formatMoney(Math.abs(amountCents), currency)}`;
	};

	const toDateParam = (value: Date | string): string => {
		const date = toDate(value);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
			date.getDate()
		).padStart(2, "0")}`;
	};

	const toDateTimeLocalValue = (value: Date | string): string => {
		const date = toDate(value);
		const localTimestamp = date.getTime() - date.getTimezoneOffset() * 60_000;
		return new Date(localTimestamp).toISOString().slice(0, 16);
	};

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

	const bookingStatusClass = (status: string): string => {
		switch (status) {
			case "cancelled":
				return "bg-rose-100 text-rose-700";
			case "completed":
				return "bg-emerald-100 text-emerald-700";
			case "confirmed":
			case "in_progress":
				return "bg-sky-100 text-sky-700";
			default:
				return "bg-muted text-muted-foreground";
		}
	};

	const paymentStatusClass = (status: string): string => {
		switch (status) {
			case "refunded":
				return "bg-amber-100 text-amber-700";
			case "paid":
				return "bg-emerald-100 text-emerald-700";
			case "partially_paid":
				return "bg-sky-100 text-sky-700";
			case "failed":
				return "bg-rose-100 text-rose-700";
			default:
				return "bg-muted text-muted-foreground";
		}
	};

	const escalationStatusClass = (status: string): string => {
		switch (status) {
			case "requested":
				return "bg-amber-100 text-amber-700";
			case "approved":
				return "bg-emerald-100 text-emerald-700";
			case "rejected":
				return "bg-rose-100 text-rose-700";
			default:
				return "bg-muted text-muted-foreground";
		}
	};

	const disputeStatusClass = (status: string): string => {
		switch (status) {
			case "resolved":
				return "bg-emerald-100 text-emerald-700";
			case "rejected":
				return "bg-rose-100 text-rose-700";
			case "under_review":
				return "bg-sky-100 text-sky-700";
			default:
				return "bg-amber-100 text-amber-700";
		}
	};

	const refundStatusClass = (status: string): string => {
		switch (status) {
			case "processed":
				return "bg-emerald-100 text-emerald-700";
			case "failed":
			case "rejected":
				return "bg-rose-100 text-rose-700";
			case "approved":
				return "bg-sky-100 text-sky-700";
			default:
				return "bg-amber-100 text-amber-700";
		}
	};

	const paymentAttemptStatusClass = (status: string): string => {
		switch (status) {
			case "captured":
				return "bg-emerald-100 text-emerald-700";
			case "failed":
			case "cancelled":
				return "bg-rose-100 text-rose-700";
			case "authorized":
			case "requires_action":
				return "bg-sky-100 text-sky-700";
			default:
				return "bg-muted text-muted-foreground";
		}
	};

	const affiliatePayoutStatusClass = (status: string): string => {
		switch (status) {
			case "paid":
				return "bg-emerald-100 text-emerald-700";
			case "eligible":
				return "bg-sky-100 text-sky-700";
			case "voided":
				return "bg-rose-100 text-rose-700";
			default:
				return "bg-amber-100 text-amber-700";
		}
	};

	const shiftStatusClass = (status: string): string => {
		switch (status) {
			case "applied":
				return "bg-emerald-100 text-emerald-700";
			case "rejected":
			case "cancelled":
				return "bg-rose-100 text-rose-700";
			case "pending":
				return "bg-amber-100 text-amber-700";
			default:
				return "bg-muted text-muted-foreground";
		}
	};

	const currentBookings = $derived($mineBookingsQuery.data?.items ?? []);
	const totalBookings = $derived($mineBookingsQuery.data?.total ?? 0);

	const affiliateBookings = $derived(
		$myAffiliateBookingsQuery.data?.items ?? []
	);

	const myCancellationRequests = $derived(
		$myCancellationRequestsQuery.data ?? []
	);
	const myShiftRequests = $derived($myShiftRequestsQuery.data ?? []);
	const myDisputes = $derived($myDisputesQuery.data ?? []);
	const myRefunds = $derived($myRefundsQuery.data ?? []);
	const myPaymentAttempts = $derived($myPaymentAttemptsQuery.data ?? []);

	const bookingRequestByBookingId = $derived.by(() => {
		return new Map(
			myCancellationRequests.map((request) => [request.bookingId, request])
		);
	});

	const shiftRequestByBookingId = $derived.by(() => {
		return new Map(
			myShiftRequests.map((request) => [request.bookingId, request])
		);
	});

	const shiftRequestsNeedingReview = $derived.by(() => {
		return myShiftRequests.filter((request) => {
			return (
				request.status === "pending" &&
				request.customerDecision === "pending"
			);
		});
	});

	const latestDisputeByBookingId = $derived.by(() => {
		const entries = new Map<string, (typeof myDisputes)[number]>();
		for (const item of myDisputes) {
			if (!entries.has(item.bookingId)) {
				entries.set(item.bookingId, item);
			}
		}
		return entries;
	});

	const latestRefundByBookingId = $derived.by(() => {
		const entries = new Map<string, (typeof myRefunds)[number]>();
		for (const item of myRefunds) {
			if (!entries.has(item.bookingId)) {
				entries.set(item.bookingId, item);
			}
		}
		return entries;
	});

	const latestPaymentAttemptByBookingId = $derived.by(() => {
		const entries = new Map<string, (typeof myPaymentAttempts)[number]>();
		for (const item of myPaymentAttempts) {
			if (!entries.has(item.bookingId)) {
				entries.set(item.bookingId, item);
			}
		}
		return entries;
	});

	const filteredBookings = $derived.by(() => {
		const normalizedSearch = searchTerm.trim().toLowerCase();
		return currentBookings.filter((item) => {
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

	const activeBookingCount = $derived(
		currentBookings.filter((item) => activeStatuses.has(item.status)).length
	);

	const cancelledBookingCount = $derived(
		currentBookings.filter((item) => item.status === "cancelled").length
	);

	const bookingsPending = $derived($mineBookingsQuery.isPending);
	const bookingsError = $derived($mineBookingsQuery.error);

	const affiliateBookingsPending = $derived(
		$myAffiliateBookingsQuery.isPending
	);
	const affiliateBookingsError = $derived($myAffiliateBookingsQuery.error);

	const cancellationRequestsPending = $derived(
		$myCancellationRequestsQuery.isPending
	);
	const cancellationRequestsError = $derived(
		$myCancellationRequestsQuery.error
	);

	const shiftRequestsPending = $derived($myShiftRequestsQuery.isPending);
	const shiftRequestsError = $derived($myShiftRequestsQuery.error);

	const disputesPending = $derived($myDisputesQuery.isPending);
	const disputesError = $derived($myDisputesQuery.error);
	const refundsPending = $derived($myRefundsQuery.isPending);
	const refundsError = $derived($myRefundsQuery.error);
	const paymentAttemptsPending = $derived($myPaymentAttemptsQuery.isPending);
	const paymentAttemptsError = $derived($myPaymentAttemptsQuery.error);

	const refetchBookingState = async () => {
		await Promise.all([
			$mineBookingsQuery.refetch(),
			$myAffiliateBookingsQuery.refetch(),
			$myCancellationRequestsQuery.refetch(),
			$myShiftRequestsQuery.refetch(),
			$myDisputesQuery.refetch(),
			$myRefundsQuery.refetch(),
			$myPaymentAttemptsQuery.refetch(),
		]);
	};

	const startCancelFlow = (bookingId: string) => {
		cancelDraftBookingId = bookingId;
		cancelReasonDraft = "Please cancel this booking";
		actionError = null;
		actionMessage = null;
	};

	const closeCancelFlow = () => {
		cancelDraftBookingId = null;
		cancelReasonDraft = "Please cancel this booking";
	};

	const confirmCancellationAction = async (bookingId: string) => {
		cancelPendingBookingId = bookingId;
		actionError = null;
		actionMessage = null;
		try {
			await $requestCancellationMutation.mutateAsync({
				bookingId,
				...(cancelReasonDraft.trim()
					? { reason: cancelReasonDraft.trim() }
					: {}),
			});
			actionMessage = `Cancellation request submitted for booking ${bookingId.slice(0, 8)}.`;
			closeCancelFlow();
			await refetchBookingState();
		} catch (error) {
			actionError =
				error instanceof Error
					? error.message
					: "Failed to request cancellation.";
		} finally {
			cancelPendingBookingId = null;
		}
	};

	const startShiftFlow = (bookingItem: {
		id: string;
		startsAt: Date | string;
		endsAt: Date | string;
		passengers: number;
	}) => {
		const currentStartsAt = toDate(bookingItem.startsAt);
		const currentEndsAt = toDate(bookingItem.endsAt);
		const durationMs = Math.max(
			currentEndsAt.getTime() - currentStartsAt.getTime(),
			0
		);
		const proposedStartsAt = new Date(currentStartsAt.getTime() + HOUR_MS);
		const proposedEndsAt = new Date(proposedStartsAt.getTime() + durationMs);

		shiftDraftBookingId = bookingItem.id;
		shiftDraftStartsAt = toDateTimeLocalValue(proposedStartsAt);
		shiftDraftEndsAt = toDateTimeLocalValue(proposedEndsAt);
		shiftDraftPassengers = String(bookingItem.passengers);
		shiftReasonDraft = "Please shift this booking";
		actionError = null;
		actionMessage = null;
	};

	const closeShiftFlow = () => {
		shiftDraftBookingId = null;
		shiftDraftStartsAt = "";
		shiftDraftEndsAt = "";
		shiftDraftPassengers = "1";
		shiftReasonDraft = "Please shift this booking";
	};

	const createShiftRequest = async (bookingId: string) => {
		const startsAt = new Date(shiftDraftStartsAt);
		const endsAt = new Date(shiftDraftEndsAt);
		const passengers = Number.parseInt(shiftDraftPassengers, 10);

		if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
			actionError = "Shift start/end must be valid dates.";
			return;
		}
		if (startsAt >= endsAt) {
			actionError = "Shift start must be before end.";
			return;
		}
		if (!Number.isFinite(passengers) || passengers < 1) {
			actionError = "Passengers must be at least 1.";
			return;
		}

		shiftPendingBookingId = bookingId;
		actionError = null;
		actionMessage = null;
		try {
			await $createShiftRequestMutation.mutateAsync({
				bookingId,
				startsAt,
				endsAt,
				passengers,
				...(shiftReasonDraft.trim() ? { reason: shiftReasonDraft.trim() } : {}),
			});
			actionMessage = `Shift request updated for booking ${bookingId.slice(0, 8)}.`;
			closeShiftFlow();
			await refetchBookingState();
		} catch (error) {
			actionError =
				error instanceof Error
					? error.message
					: "Failed to create shift request.";
		} finally {
			shiftPendingBookingId = null;
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
			await $reviewShiftRequestMineMutation.mutateAsync({
				bookingId,
				decision,
				...(shiftReviewNoteDraft.trim()
					? { note: shiftReviewNoteDraft.trim() }
					: {}),
			});
			actionMessage = `Shift request ${decision}d for booking ${bookingId.slice(0, 8)}.`;
			closeShiftReview();
			await refetchBookingState();
		} catch (error) {
			actionError =
				error instanceof Error
					? error.message
					: "Failed to review shift request.";
		} finally {
			shiftReviewPendingBookingId = null;
		}
	};

	const canPay = (bookingItem: (typeof currentBookings)[number]): boolean => {
		if (bookingItem.status === "cancelled") {
			return false;
		}
		return (
			bookingItem.paymentStatus === "unpaid" ||
			bookingItem.paymentStatus === "partially_paid" ||
			bookingItem.paymentStatus === "failed"
		);
	};

	const getExpiresAt = (bookingItem: (typeof currentBookings)[number]): Date | null => {
		if (bookingItem.status !== "pending" && bookingItem.status !== "awaiting_payment") {
			return null;
		}
		if (bookingItem.paymentStatus === "paid" || bookingItem.paymentStatus === "partially_paid") {
			return null;
		}
		return new Date(toDate(bookingItem.createdAt).getTime() + BOOKING_EXPIRY_MS);
	};

	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => { now = Date.now(); }, 1000);
		return () => clearInterval(timer);
	});

	const formatCountdown = (expiresAt: Date): string => {
		const diff = expiresAt.getTime() - now;
		if (diff <= 0) {
			return "Expired";
		}
		const mins = Math.floor(diff / 60_000);
		const secs = Math.floor((diff % 60_000) / 1000);
		return `${mins}:${String(secs).padStart(2, "0")}`;
	};

	const startPayment = async (
		bookingItem: (typeof currentBookings)[number]
	) => {
		const cpPublicId = PUBLIC_CLOUDPAYMENTS_PUBLIC_ID || undefined;
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

			const widget = new (window as unknown as { cp: CpNamespace }).cp.CloudPayments();
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

			await refetchBookingState();
		} catch (error) {
			actionError =
				error instanceof Error ? error.message : "Payment failed";
		} finally {
			payPendingBookingId = null;
		}
	};
</script>

{#if $sessionQuery.isPending}
	<div class="flex min-h-[50vh] items-center justify-center">
		<p class="text-muted-foreground">Loading bookings...</p>
	</div>
{:else if !$sessionQuery.data}
	<div class="flex min-h-[50vh] items-center justify-center">
		<p class="text-muted-foreground">Redirecting to login...</p>
	</div>
{:else}
	<div class="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
		<div class="space-y-2">
			<h1 class="text-3xl font-bold tracking-tight">My Bookings</h1>
			<p class="text-sm text-muted-foreground">
				Personal booking history with statuses and cancellation request
				options.
			</p>
		</div>

		<div class="grid gap-4 md:grid-cols-4">
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
					<CardDescription>My Shift Requests</CardDescription>
					<CardTitle class="text-2xl">{myShiftRequests.length}</CardTitle>
				</CardHeader>
			</Card>
		</div>

		{#if actionMessage}
			<p class="text-sm text-primary">{actionMessage}</p>
		{/if}
		{#if actionError}
			<p class="text-sm text-destructive">{actionError}</p>
		{/if}

		<Card>
			<CardHeader>
				<CardTitle>My Cancellation Requests</CardTitle>
				<CardDescription>
					Track your cancellation request statuses.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if cancellationRequestsPending}
					<p class="text-sm text-muted-foreground">
						Loading cancellation requests...
					</p>
				{:else if cancellationRequestsError}
					<p class="text-sm text-destructive">
						Failed to load cancellation requests:
						{cancellationRequestsError instanceof Error
							? cancellationRequestsError.message
							: "Unknown error"}
					</p>
				{:else if myCancellationRequests.length === 0}
					<p class="text-sm text-muted-foreground">
						No cancellation requests yet.
					</p>
				{:else}
					<ul class="space-y-3">
						{#each myCancellationRequests as escalation (escalation.id)}
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
										{#if escalation.reviewNote}
											<p class="mt-1 text-xs text-muted-foreground">
												Review: {escalation.reviewNote}
											</p>
										{/if}
									</div>
									<span
										class={`rounded-full px-2 py-1 text-xs font-medium ${escalationStatusClass(escalation.status)}`}
									>
										{escalation.status}
									</span>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle>My Shift Requests</CardTitle>
				<CardDescription>
					Track your shift requests and approve manager-proposed changes.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if shiftRequestsPending}
					<p class="text-sm text-muted-foreground">Loading shift requests...</p>
				{:else if shiftRequestsError}
					<p class="text-sm text-destructive">
						Failed to load shift requests:
						{shiftRequestsError instanceof Error
							? shiftRequestsError.message
							: "Unknown error"}
					</p>
				{:else if myShiftRequests.length === 0}
					<p class="text-sm text-muted-foreground">No shift requests yet.</p>
				{:else}
					<ul class="space-y-3">
						{#each myShiftRequests as shiftRequest (shiftRequest.id)}
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

								{#if shiftRequest.status === "pending" && shiftRequest.customerDecision === "pending"}
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
														void reviewShiftRequest(shiftRequest.bookingId, "approve")}
												>
													Approve shift
												</Button>
												<Button
													variant="destructive"
													disabled={shiftReviewPendingBookingId === shiftRequest.bookingId}
													onclick={() =>
														void reviewShiftRequest(shiftRequest.bookingId, "reject")}
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
											onclick={() => startShiftReview(shiftRequest.bookingId)}
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

		<Card>
				<CardHeader>
					<CardTitle class="text-base">
						Affiliate Referrals (Redacted)
					</CardTitle>
					<CardDescription>
						Partner bookings created by you. Contact details are intentionally
						hidden.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{#if affiliateBookingsPending}
						<p class="text-sm text-muted-foreground">
							Loading affiliate referrals...
						</p>
					{:else if affiliateBookingsError}
						<p class="text-sm text-destructive">
							Failed to load affiliate referrals:
							{affiliateBookingsError instanceof Error
								? affiliateBookingsError.message
								: "Unknown error"}
						</p>
					{:else if affiliateBookings.length === 0}
						<p class="text-sm text-muted-foreground">
							No affiliate referrals yet.
						</p>
					{:else}
						<ul class="space-y-3">
							{#each affiliateBookings as affiliateBooking (affiliateBooking.bookingRef)}
								<li class="rounded-md border p-3">
									<div class="flex flex-wrap items-start justify-between gap-2">
										<div class="space-y-1">
											<p class="text-sm font-medium text-foreground">
												{affiliateBooking.bookingRef}
											</p>
											<p class="text-xs text-muted-foreground">
												Referral: {affiliateBooking.referralCode}
											</p>
											<p class="text-xs text-muted-foreground">
												Customer ref: {affiliateBooking.customerRef}
											</p>
											<p class="text-xs text-muted-foreground">
												Boat: {affiliateBooking.boatName} (
												{affiliateBooking.boatId})
											</p>
											<p class="text-xs text-muted-foreground">
												{formatBookingRange(
													affiliateBooking.startsAt,
													affiliateBooking.endsAt
												)}
											</p>
											<p class="text-xs text-muted-foreground">
												Commission:
												{formatMoney(
													affiliateBooking.commissionAmountCents,
													affiliateBooking.commissionCurrency
												)}
											</p>
											{#if affiliateBooking.payoutPaidAt}
												<p class="text-xs text-muted-foreground">
													Paid at
													{formatDateTime(affiliateBooking.payoutPaidAt)}
												</p>
											{:else if affiliateBooking.payoutEligibleAt}
												<p class="text-xs text-muted-foreground">
													Eligible since
													{formatDateTime(affiliateBooking.payoutEligibleAt)}
												</p>
											{:else if affiliateBooking.payoutVoidedAt}
												<p class="text-xs text-muted-foreground">
													Voided at
													{formatDateTime(affiliateBooking.payoutVoidedAt)}
													{affiliateBooking.payoutVoidReason
														? ` (${affiliateBooking.payoutVoidReason})`
														: ""}
												</p>
											{/if}
										</div>
										<div class="flex flex-wrap gap-2">
											<span
												class={`rounded-full px-2 py-1 text-xs font-medium ${bookingStatusClass(affiliateBooking.status)}`}
											>
												{affiliateBooking.status}
											</span>
											<span
												class={`rounded-full px-2 py-1 text-xs font-medium ${paymentStatusClass(affiliateBooking.paymentStatus)}`}
											>
												{affiliateBooking.paymentStatus}
											</span>
											<span
												class={`rounded-full px-2 py-1 text-xs font-medium ${affiliatePayoutStatusClass(affiliateBooking.payoutStatus)}`}
											>
												{affiliateBooking.payoutStatus}
											</span>
										</div>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</CardContent>
			</Card>

			<div class="grid gap-4 lg:grid-cols-3">
				<Card>
					<CardHeader>
						<CardTitle class="text-base">Disputes</CardTitle>
						<CardDescription>
							Customer-side dispute cases for your bookings.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{#if disputesPending}
							<p class="text-sm text-muted-foreground">Loading disputes...</p>
						{:else if disputesError}
							<p class="text-sm text-destructive">
								Failed to load disputes:
								{disputesError instanceof Error
									? disputesError.message
									: "Unknown error"}
							</p>
						{:else if myDisputes.length === 0}
							<p class="text-sm text-muted-foreground">No disputes yet.</p>
						{:else}
							<ul class="space-y-2">
								{#each myDisputes.slice(0, 5) as dispute (dispute.id)}
									<li class="rounded-md border p-2 text-xs">
										<div class="flex items-center justify-between gap-2">
											<span class="font-medium">
												#{dispute.bookingId.slice(0, 8)}
											</span>
											<span
												class={`rounded-full px-2 py-1 text-[11px] font-medium ${disputeStatusClass(dispute.status)}`}
											>
												{dispute.status}
											</span>
										</div>
										<p class="mt-1 text-muted-foreground">
											Created {formatDateTime(dispute.createdAt)}
										</p>
									</li>
								{/each}
							</ul>
						{/if}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle class="text-base">Refunds</CardTitle>
						<CardDescription>
							Refund requests and their processing status.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{#if refundsPending}
							<p class="text-sm text-muted-foreground">Loading refunds...</p>
						{:else if refundsError}
							<p class="text-sm text-destructive">
								Failed to load refunds:
								{refundsError instanceof Error
									? refundsError.message
									: "Unknown error"}
							</p>
						{:else if myRefunds.length === 0}
							<p class="text-sm text-muted-foreground">No refunds yet.</p>
						{:else}
							<ul class="space-y-2">
								{#each myRefunds.slice(0, 5) as refund (refund.id)}
									<li class="rounded-md border p-2 text-xs">
										<div class="flex items-center justify-between gap-2">
											<span class="font-medium">
												#{refund.bookingId.slice(0, 8)}
											</span>
											<span
												class={`rounded-full px-2 py-1 text-[11px] font-medium ${refundStatusClass(refund.status)}`}
											>
												{refund.status}
											</span>
										</div>
										<p class="mt-1 text-muted-foreground">
											{formatMoney(refund.amountCents, refund.currency)}
											requested
										</p>
									</li>
								{/each}
							</ul>
						{/if}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle class="text-base">Payment Attempts</CardTitle>
						<CardDescription>
							Recent payment attempts attached to your bookings.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{#if paymentAttemptsPending}
							<p class="text-sm text-muted-foreground">
								Loading payment attempts...
							</p>
						{:else if paymentAttemptsError}
							<p class="text-sm text-destructive">
								Failed to load payment attempts:
								{paymentAttemptsError instanceof Error
									? paymentAttemptsError.message
									: "Unknown error"}
							</p>
						{:else if myPaymentAttempts.length === 0}
							<p class="text-sm text-muted-foreground">
								No payment attempts yet.
							</p>
						{:else}
							<ul class="space-y-2">
								{#each myPaymentAttempts.slice(0, 5) as attempt (attempt.id)}
									<li class="rounded-md border p-2 text-xs">
										<div class="flex items-center justify-between gap-2">
											<span class="font-medium">
												#{attempt.bookingId.slice(0, 8)}
											</span>
											<span
												class={`rounded-full px-2 py-1 text-[11px] font-medium ${paymentAttemptStatusClass(attempt.status)}`}
											>
												{attempt.status}
											</span>
										</div>
										<p class="mt-1 text-muted-foreground">
											{formatMoney(attempt.amountCents, attempt.currency)}
										</p>
									</li>
								{/each}
							</ul>
						{/if}
					</CardContent>
				</Card>
			</div>

		<Card>
			<CardHeader>
				<CardTitle>Booking History</CardTitle>
				<CardDescription>
					Inspect status, payment, and available booking options.
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

				{#if bookingsPending}
					<p class="text-sm text-muted-foreground">Loading bookings...</p>
				{:else if bookingsError}
					<p class="text-sm text-destructive">
						Failed to load bookings:
						{bookingsError instanceof Error
							? bookingsError.message
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
							{@const expiresAt = getExpiresAt(bookingItem)}
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
									<div class="flex flex-col items-end gap-2">
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
										{#if bookingRequestByBookingId.get(bookingItem.id)}
											{@const request = bookingRequestByBookingId.get(bookingItem.id)}
											<span
												class={`rounded-full px-2 py-1 text-xs font-medium ${escalationStatusClass(request?.status ?? "requested")}`}
											>
												Escalation: {request?.status}
											</span>
										{/if}
										{#if latestDisputeByBookingId.get(bookingItem.id)}
											{@const dispute = latestDisputeByBookingId.get(bookingItem.id)}
											<span
												class={`rounded-full px-2 py-1 text-xs font-medium ${disputeStatusClass(dispute?.status ?? "open")}`}
											>
												Dispute: {dispute?.status}
											</span>
										{/if}
										{#if latestRefundByBookingId.get(bookingItem.id)}
											{@const refund = latestRefundByBookingId.get(bookingItem.id)}
											<span
												class={`rounded-full px-2 py-1 text-xs font-medium ${refundStatusClass(refund?.status ?? "requested")}`}
											>
												Refund: {refund?.status}
											</span>
										{/if}
										{#if latestPaymentAttemptByBookingId.get(bookingItem.id)}
											{@const attempt = latestPaymentAttemptByBookingId.get(bookingItem.id)}
											<span
												class={`rounded-full px-2 py-1 text-xs font-medium ${paymentAttemptStatusClass(attempt?.status ?? "initiated")}`}
											>
												Payment: {attempt?.status}
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
										{#if expiresAt}
											{@const countdown = formatCountdown(expiresAt)}
											<span class={`text-xs font-medium ${countdown === "Expired" ? "text-destructive" : "text-amber-600"}`}>
												{countdown === "Expired" ? "⏰ Payment expired" : `⏳ Pay within ${countdown}`}
											</span>
										{/if}
									</div>
								</div>

								<div
									class="grid gap-1 text-xs text-muted-foreground md:grid-cols-2"
								>
									<p>
										Total:
										{formatMoney(bookingItem.totalPriceCents, bookingItem.currency)}
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
											data-testid="pay-button"
										>
											{payPendingBookingId === bookingItem.id
												? "Processing..."
												: `Pay ${formatMoney(bookingItem.totalPriceCents - (bookingItem.refundAmountCents ?? 0), bookingItem.currency)}`}
										</Button>
									{/if}

									{#if bookingItem.status !== "cancelled"}
										{#if bookingRequestByBookingId.get(bookingItem.id)?.status === "requested"}
											<Button size="sm" variant="outline" disabled>
												Cancellation requested
											</Button>
										{:else if cancelDraftBookingId === bookingItem.id}
											<div
												class="flex w-full flex-col gap-2 md:max-w-xl md:flex-row"
											>
												<Input
													value={cancelReasonDraft}
													oninput={(event) => {
														const target = event.target as HTMLInputElement;
														cancelReasonDraft = target.value;
													}}
													placeholder="Cancellation reason"
												/>
												<div class="flex gap-2">
													<Button
														variant="default"
														disabled={cancelPendingBookingId === bookingItem.id}
														onclick={() =>
															void confirmCancellationAction(bookingItem.id)}
													>
														Send request
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
												Request cancellation
											</Button>
										{/if}
									{/if}

									{#if activeStatuses.has(bookingItem.status)}
										{#if shiftDraftBookingId === bookingItem.id}
											<div
												class="grid w-full gap-2 rounded-md border p-3 md:grid-cols-2"
											>
												<Input
													type="datetime-local"
													value={shiftDraftStartsAt}
													oninput={(event) => {
														const target = event.target as HTMLInputElement;
														shiftDraftStartsAt = target.value;
													}}
												/>
												<Input
													type="datetime-local"
													value={shiftDraftEndsAt}
													oninput={(event) => {
														const target = event.target as HTMLInputElement;
														shiftDraftEndsAt = target.value;
													}}
												/>
												<Input
													type="number"
													min="1"
													value={shiftDraftPassengers}
													oninput={(event) => {
														const target = event.target as HTMLInputElement;
														shiftDraftPassengers = target.value;
													}}
													placeholder="Passengers"
												/>
												<Input
													value={shiftReasonDraft}
													oninput={(event) => {
														const target = event.target as HTMLInputElement;
														shiftReasonDraft = target.value;
													}}
													placeholder="Shift reason"
												/>
												<div class="flex gap-2 md:col-span-2">
													<Button
														variant="default"
														disabled={shiftPendingBookingId === bookingItem.id}
														onclick={() => void createShiftRequest(bookingItem.id)}
													>
														{shiftPendingBookingId === bookingItem.id
															? "Submitting..."
															: "Submit shift"}
													</Button>
													<Button
														variant="outline"
														disabled={shiftPendingBookingId === bookingItem.id}
														onclick={closeShiftFlow}
													>
														Dismiss
													</Button>
												</div>
											</div>
										{:else}
											<Button
												size="sm"
												variant="outline"
												onclick={() => startShiftFlow(bookingItem)}
											>
												{shiftRequest?.status === "pending"
													? "Update shift request"
													: "Request shift"}
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
