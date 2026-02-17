<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import * as Card from "@full-stack-cf-app/ui/components/card";
	import { Input } from "@full-stack-cf-app/ui/components/input";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import { orpc } from "$lib/orpc";

	let customerState = $state<{ activeSubscriptions?: unknown[] } | null>(null);
	let passkeyPending = $state(false);
	let passkeyMessage = $state<string | null>(null);
	let passkeyError = $state<string | null>(null);
	let cancelPendingBookingId = $state<string | null>(null);
	let cancelDraftBookingId = $state<string | null>(null);
	let cancelReasonDraft = $state("Cancelled from dashboard");
	let cancelMessage = $state<string | null>(null);
	let cancelError = $state<string | null>(null);

	const sessionQuery = authClient.useSession();

	const privateDataQuery = createQuery(orpc.privateData.queryOptions());
	const myBookingsQuery = createQuery(
		orpc.booking.listMine.queryOptions({
			input: {
				limit: 20,
				offset: 0,
				sortBy: "startsAt",
				sortOrder: "desc",
			},
		})
	);
	const cancelManagedBookingMutation = createMutation(
		orpc.booking.cancelManaged.mutationOptions()
	);

	$effect(() => {
		if (!($sessionQuery.isPending || $sessionQuery.data)) {
			goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
			);
		}
	});

	$effect(() => {
		if ($sessionQuery.data) {
			authClient.customer.state().then(({ data }) => {
				customerState = data;
			});
		}
	});

	const hasPro = $derived(
		(customerState?.activeSubscriptions?.length ?? 0) > 0
	);

	const toDate = (value: Date | string): Date => {
		return value instanceof Date ? value : new Date(value);
	};

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

	const formatMoney = (amountCents: number, currency: string): string => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			maximumFractionDigits: 2,
		}).format(amountCents / 100);
	};

	const registerPasskey = async () => {
		if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
			passkeyError = "Passkeys are not supported in this browser.";
			passkeyMessage = null;
			return;
		}

		const user = $sessionQuery.data?.user;
		if (!user) {
			passkeyError = "You must be signed in to register a passkey.";
			passkeyMessage = null;
			return;
		}

		passkeyPending = true;
		passkeyError = null;
		passkeyMessage = null;
		try {
			const { error } = await authClient.passkey.addPasskey({
				name: user.email ?? user.name ?? "My passkey",
			});

			if (error) {
				passkeyError = error.message || "Failed to register passkey.";
				return;
			}

			passkeyMessage = "Passkey registered. You can sign in using passkey now.";
		} catch (error) {
			passkeyError =
				error instanceof Error ? error.message : "Failed to register passkey.";
		} finally {
			passkeyPending = false;
		}
	};

	const startCancelBookingFlow = (bookingId: string) => {
		cancelDraftBookingId = bookingId;
		cancelReasonDraft = "Cancelled from dashboard";
		cancelError = null;
		cancelMessage = null;
	};

	const cancelCancelBookingFlow = () => {
		cancelDraftBookingId = null;
		cancelReasonDraft = "Cancelled from dashboard";
	};

	const confirmCancelManagedBooking = async (bookingId: string) => {
		const reason = cancelReasonDraft.trim();
		cancelPendingBookingId = bookingId;
		cancelError = null;
		cancelMessage = null;
		try {
			await $cancelManagedBookingMutation.mutateAsync({
				bookingId,
				...(reason ? { reason } : {}),
			});
			cancelMessage = `Booking ${bookingId.slice(0, 8)} cancelled.`;
			cancelDraftBookingId = null;
			await $myBookingsQuery.refetch();
		} catch (error) {
			cancelError =
				error instanceof Error ? error.message : "Failed to cancel booking.";
		} finally {
			cancelPendingBookingId = null;
		}
	};
</script>

{#if $sessionQuery.isPending}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if !$sessionQuery.data}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Redirecting to login...</p>
	</div>
{:else}
	<div class="max-w-2xl mx-auto p-6 space-y-6">
		<h1 class="text-3xl font-bold">Dashboard</h1>

		<Card.Root>
			<Card.Header>
				<Card.Title>Welcome, {$sessionQuery.data.user.name}</Card.Title>
				<Card.Description>Your account overview</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">API Status</span>
					<span class="text-foreground">
						{$privateDataQuery.data?.message ?? "Loading..."}
					</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Plan</span>
					<span
						class={hasPro ? "text-primary font-semibold" : "text-foreground"}
					>
						{hasPro ? "Pro" : "Free"}
					</span>
				</div>
			</Card.Content>
			<Card.Footer class="flex gap-2">
				{#if hasPro}
					<Button
						variant="outline"
						onclick={async () => await authClient.customer.portal()}
					>
						Manage Subscription
					</Button>
				{:else}
					<Button
						onclick={async () => await authClient.checkout({ slug: "pro" })}
					>
						Upgrade to Pro
					</Button>
				{/if}
				<Button variant="outline" href={resolve("/dashboard/bookings")}>
					Managed Bookings
				</Button>
			</Card.Footer>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Passkey</Card.Title>
				<Card.Description>
					Register a passkey once, then sign in without password.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm text-muted-foreground">
				<p>Use Face ID, Touch ID, Windows Hello, or a hardware security key.</p>
				{#if passkeyMessage}
					<p class="text-primary">{passkeyMessage}</p>
				{/if}
				{#if passkeyError}
					<p class="text-destructive">{passkeyError}</p>
				{/if}
			</Card.Content>
			<Card.Footer>
				<Button
					variant="outline"
					onclick={() => void registerPasskey()}
					disabled={passkeyPending}
				>
					{passkeyPending ? "Registering..." : "Register Passkey"}
				</Button>
			</Card.Footer>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>My Bookings</Card.Title>
				<Card.Description>
					Cancel bookings from dashboard. Cancellation policy, refund,
					notification, and calendar detach are applied server-side.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#if cancelMessage}
					<p class="text-sm text-primary">{cancelMessage}</p>
				{/if}
				{#if cancelError}
					<p class="text-sm text-destructive">{cancelError}</p>
				{/if}

				{#if $myBookingsQuery.isPending}
					<p class="text-sm text-muted-foreground">Loading bookings...</p>
				{:else if $myBookingsQuery.isError}
					<p class="text-sm text-muted-foreground">
						Bookings are unavailable for this account.
					</p>
				{:else if ($myBookingsQuery.data?.items.length ?? 0) === 0}
					<p class="text-sm text-muted-foreground">No bookings found.</p>
				{:else}
					<ul class="space-y-3">
						{#each $myBookingsQuery.data?.items ?? [] as myBooking (myBooking.id)}
							<li
								class="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
							>
								<div class="space-y-1 text-sm">
									<p class="font-medium">
										#{myBooking.id.slice(0, 8)} · {myBooking.status}
									</p>
									<p class="text-muted-foreground">
										{formatBookingRange(
											myBooking.startsAt,
											myBooking.endsAt
										)}
									</p>
									<p class="text-muted-foreground">
										Total:
										{formatMoney(
											myBooking.totalPriceCents,
											myBooking.currency
										)}
										· Refunded:
										{formatMoney(
											myBooking.refundAmountCents ?? 0,
											myBooking.currency
										)}
									</p>
								</div>
								{#if myBooking.status === "cancelled"}
									<Button variant="outline" disabled>Cancelled</Button>
								{:else if cancelDraftBookingId === myBooking.id}
									<div class="flex w-full max-w-sm flex-col gap-2">
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
												variant="destructive"
												onclick={() => void confirmCancelManagedBooking(myBooking.id)}
												disabled={cancelPendingBookingId === myBooking.id}
											>
												{cancelPendingBookingId === myBooking.id
													? "Cancelling..."
													: "Confirm cancel"}
											</Button>
											<Button
												variant="outline"
												onclick={cancelCancelBookingFlow}
												disabled={cancelPendingBookingId === myBooking.id}
											>
												Dismiss
											</Button>
										</div>
									</div>
								{:else}
									<Button
										variant="outline"
										onclick={() => startCancelBookingFlow(myBooking.id)}
									>
										Cancel booking
									</Button>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
{/if}
