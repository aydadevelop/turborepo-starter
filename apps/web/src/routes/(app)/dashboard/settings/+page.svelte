<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Input } from "@my-app/ui/components/input";
	import { Separator } from "@my-app/ui/components/separator";
	import { createQuery } from "@tanstack/svelte-query";
	import { onMount } from "svelte";
	import { derived } from "svelte/store";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import { hasAuthenticatedSession } from "$lib/auth-session";
	import { queryClient } from "$lib/orpc";
	import { queryKeys } from "$lib/query-keys";
	import { userInvitationsQueryOptions } from "$lib/query-options";
	import PhoneInput from "../../../../components/PhoneInput.svelte";

	const sessionQuery = authClient.useSession();

	$effect(() => {
		if ($sessionQuery.isPending) return;
		if (!hasAuthenticatedSession($sessionQuery.data)) {
			goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
			);
		}
	});

	// ---------- Linked accounts ----------
	const accountsQueryOptions = derived(sessionQuery, ($session) => ({
		queryKey: queryKeys.linkedAccounts.all,
		queryFn: async () => {
			const { data, error } = await authClient.listAccounts();
			if (error) {
				throw error;
			}
			return data ?? [];
		},
		retry: false,
		enabled: hasAuthenticatedSession($session.data),
	}));
	const accountsQuery = createQuery(accountsQueryOptions);

	const hasTelegram = $derived(
		($accountsQuery.data ?? []).some(
			(a: { providerId?: string; provider?: string }) =>
				a.providerId === "telegram" || a.provider === "telegram"
		)
	);
	const hasCredential = $derived(
		($accountsQuery.data ?? []).some(
			(a: { providerId?: string; provider?: string }) =>
				a.providerId === "credential" || a.provider === "credential"
		)
	);

	// ---------- Telegram link/unlink ----------
	let telegramPending = $state(false);
	let telegramError = $state<string | null>(null);
	let telegramSuccess = $state<string | null>(null);
	let telegramWidgetReady = $state(false);

	onMount(() => {
		authClient
			.getTelegramConfig()
			.then((config) => {
				if (!config.data?.botUsername) return;
				telegramWidgetReady = true;
			})
			.catch(() => {
				// Telegram plugin not configured — hide widget
			});
	});

	const initTelegramLinkWidget = () => {
		authClient.initTelegramWidget(
			"telegram-link-widget",
			{ size: "large", cornerRadius: 8, showUserPhoto: true },
			async (authData) => {
				telegramPending = true;
				telegramError = null;
				telegramSuccess = null;
				const result = await authClient.linkTelegram(authData);
				telegramPending = false;
				if (result.error) {
					telegramError = result.error.message || "Failed to link Telegram.";
					return;
				}
				telegramSuccess = "Telegram account linked successfully.";
				queryClient.invalidateQueries({
					queryKey: queryKeys.linkedAccounts.all,
				});
			}
		);
	};

	let showTelegramWidget = $state(false);
	$effect(() => {
		if (showTelegramWidget && telegramWidgetReady) {
			// Defer to next tick so the DOM element exists
			queueMicrotask(() => initTelegramLinkWidget());
		}
	});

	const handleUnlinkTelegram = async () => {
		telegramPending = true;
		telegramError = null;
		telegramSuccess = null;
		const result = await authClient.unlinkTelegram();
		telegramPending = false;
		if (result.error) {
			telegramError = result.error.message || "Failed to unlink Telegram.";
			return;
		}
		telegramSuccess = "Telegram account unlinked.";
		showTelegramWidget = false;
		queryClient.invalidateQueries({ queryKey: queryKeys.linkedAccounts.all });
	};

	// ---------- Phone ----------
	let phoneStep = $state<"idle" | "enter" | "otp">("idle");
	let phoneInput = $state("");
	let phoneUnmasked = $state("");
	let phoneCode = $state("");
	let phonePending = $state(false);
	let phoneError = $state<string | null>(null);
	let phoneSuccess = $state<string | null>(null);

	const fullPhone = $derived(phoneUnmasked ? `+${phoneUnmasked}` : "");

	const handleSendPhoneOtp = async () => {
		if (!fullPhone) {
			phoneError = "Phone number is required.";
			return;
		}
		phonePending = true;
		phoneError = null;
		const { error } = await authClient.phoneNumber.sendOtp({
			phoneNumber: fullPhone,
		});
		phonePending = false;
		if (error) {
			phoneError = error.message || "Failed to send OTP.";
			return;
		}
		phoneStep = "otp";
	};

	const handleVerifyPhone = async () => {
		const trimmedCode = phoneCode.trim();
		if (!trimmedCode) {
			phoneError = "Enter the verification code.";
			return;
		}
		phonePending = true;
		phoneError = null;
		const { error } = await authClient.phoneNumber.verify({
			phoneNumber: fullPhone,
			code: trimmedCode,
			updatePhoneNumber: true,
		});
		phonePending = false;
		if (error) {
			phoneError = error.message || "Invalid code.";
			return;
		}
		phoneSuccess = "Phone number updated.";
		phoneStep = "idle";
		phoneInput = "";
		phoneUnmasked = "";
		phoneCode = "";
		queryClient.invalidateQueries({ queryKey: queryKeys.linkedAccounts.all });
	};

	const cancelPhoneFlow = () => {
		phoneStep = "idle";
		phoneInput = "";
		phoneUnmasked = "";
		phoneCode = "";
		phoneError = null;
		phoneSuccess = null;
	};

	// ---------- Passkey ----------
	let passkeyPending = $state(false);
	let passkeyMessage = $state<string | null>(null);
	let passkeyError = $state<string | null>(null);

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
		} catch (err) {
			passkeyError =
				err instanceof Error ? err.message : "Failed to register passkey.";
		} finally {
			passkeyPending = false;
		}
	};

	// ---------- User info ----------
	const user = $derived($sessionQuery.data?.user);
	const phoneNumber = $derived(
		(user as { phoneNumber?: string } | undefined)?.phoneNumber ?? null
	);
	const telegramUsername = $derived(
		(user as { telegramUsername?: string } | undefined)?.telegramUsername ??
			null
	);

	// ---------- Invitations ----------
	const invitationsQuery = createQuery(
		derived(sessionQuery, ($session) =>
			userInvitationsQueryOptions({
				enabled: hasAuthenticatedSession($session.data),
			})
		)
	);

	const pendingInvitations = $derived(
		($invitationsQuery.data ?? []).filter((inv) => inv.status === "pending")
	);
	const pastInvitations = $derived(
		($invitationsQuery.data ?? []).filter((inv) => inv.status !== "pending")
	);
	const pendingInvitationCount = $derived(pendingInvitations.length);

	let pendingActionId = $state<string | null>(null);
	let invitationError = $state<string | null>(null);

	const handleAccept = async (invitationId: string) => {
		pendingActionId = invitationId;
		invitationError = null;
		const { error } = await authClient.organization.acceptInvitation({
			invitationId,
		});
		pendingActionId = null;
		if (error) {
			invitationError =
				(error as { message?: string }).message ??
				"Failed to accept invitation.";
			return;
		}
		queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all });
		queryClient.invalidateQueries({ queryKey: queryKeys.org.root });
	};

	const handleReject = async (invitationId: string) => {
		pendingActionId = invitationId;
		invitationError = null;
		const { error } = await authClient.organization.rejectInvitation({
			invitationId,
		});
		pendingActionId = null;
		if (error) {
			invitationError =
				(error as { message?: string }).message ??
				"Failed to reject invitation.";
			return;
		}
		queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all });
	};

	const formatDate = (date: Date | string) =>
		new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(date instanceof Date ? date : new Date(date));
</script>

{#if $sessionQuery.isPending}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if !hasAuthenticatedSession($sessionQuery.data)}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Redirecting to login...</p>
	</div>
{:else}
	<div class="max-w-2xl mx-auto p-6 space-y-4">
		<h1 class="text-3xl font-bold" data-testid="account-settings-heading">Account Settings</h1>

		<!-- Profile info -->
		<Card.Root>
			<Card.Header> <Card.Title>Profile</Card.Title> </Card.Header>
			<Card.Content class="space-y-3 text-sm">
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Name</span>
					<span>{user?.name ?? "—"}</span>
				</div>
				<Separator />
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Email</span>
					<span>{user?.email ?? "—"}</span>
				</div>
				{#if phoneNumber}
					<Separator />
					<div class="flex items-center justify-between">
						<span class="text-muted-foreground">Phone</span>
						<span>{phoneNumber}</span>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Linked Accounts -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Linked Accounts</Card.Title>
				<Card.Description>
					Manage sign-in methods linked to your account.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				{#if $accountsQuery.isPending}
					<p class="text-sm text-muted-foreground">Loading...</p>
				{:else}
					<!-- Email / Password -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium">Email &amp; Password</span>
							{#if hasCredential}
								<Badge variant="secondary">Connected</Badge>
							{/if}
						</div>
						{#if !hasCredential}
							<span class="text-xs text-muted-foreground">Not set</span>
						{/if}
					</div>

					<Separator />

					<!-- Telegram -->
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium">Telegram</span>
								{#if hasTelegram}
									<Badge variant="secondary">Connected</Badge>
									{#if telegramUsername}
										<span class="text-xs text-muted-foreground"
											>@{telegramUsername}</span
										>
									{/if}
								{/if}
							</div>
							{#if hasTelegram}
								<Button
									variant="outline"
									size="sm"
									onclick={() => void handleUnlinkTelegram()}
									disabled={telegramPending}
								>
									{telegramPending ? "Unlinking..." : "Unlink"}
								</Button>
							{:else if telegramWidgetReady}
								{#if !showTelegramWidget}
									<Button
										variant="outline"
										size="sm"
										onclick={() => (showTelegramWidget = true)}
									>
										Link Telegram
									</Button>
								{/if}
							{:else}
								<span class="text-xs text-muted-foreground">Unavailable</span>
							{/if}
						</div>

						{#if showTelegramWidget && !hasTelegram && telegramWidgetReady}
							<div id="telegram-link-widget"></div>
						{/if}

						{#if telegramPending}
							<p class="text-sm text-muted-foreground">Processing...</p>
						{/if}
						{#if telegramSuccess}
							<p class="text-sm text-primary">{telegramSuccess}</p>
						{/if}
						{#if telegramError}
							<p class="text-sm text-destructive" role="alert">
								{telegramError}
							</p>
						{/if}
					</div>

					<Separator />

					<!-- Phone -->
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium">Phone</span>
								{#if phoneNumber}
									<Badge variant="secondary">Connected</Badge>
									<span class="text-xs text-muted-foreground"
										>{phoneNumber}</span
									>
								{/if}
							</div>
							{#if phoneStep === "idle"}
								<Button
									variant="outline"
									size="sm"
									onclick={() => {
										phoneStep = "enter";
										phoneSuccess = null;
										phoneError = null;
									}}
								>
									{phoneNumber ? "Change" : "Set Phone"}
								</Button>
							{/if}
						</div>

						{#if phoneStep === "enter"}
							<div class="flex gap-2">
								<PhoneInput
									bind:value={phoneInput}
									bind:unmasked={phoneUnmasked}
									disabled={phonePending}
									class="flex-1"
								/>
								<Button
									size="sm"
									onclick={() => void handleSendPhoneOtp()}
									disabled={phonePending || !phoneUnmasked}
								>
									{phonePending ? "Sending..." : "Send OTP"}
								</Button>
								<Button variant="ghost" size="sm" onclick={cancelPhoneFlow}>
									Cancel
								</Button>
							</div>
						{/if}

						{#if phoneStep === "otp"}
							<p class="text-xs text-muted-foreground">
								Code sent to <strong>{phoneInput}</strong>
							</p>
							<div class="flex gap-2">
								<Input
									type="text"
									inputmode="numeric"
									placeholder="123456"
									maxlength={6}
									bind:value={phoneCode}
									disabled={phonePending}
									class="flex-1"
								/>
								<Button
									size="sm"
									onclick={() => void handleVerifyPhone()}
									disabled={phonePending || !phoneCode.trim()}
								>
									{phonePending ? "Verifying..." : "Verify"}
								</Button>
								<Button variant="ghost" size="sm" onclick={cancelPhoneFlow}>
									Cancel
								</Button>
							</div>
						{/if}

						{#if phoneSuccess}
							<p class="text-sm text-primary">{phoneSuccess}</p>
						{/if}
						{#if phoneError}
							<p class="text-sm text-destructive" role="alert">{phoneError}</p>
						{/if}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Passkey -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Passkey</Card.Title>
				<Card.Description>
					Register a passkey to sign in without a password using Face ID, Touch
					ID, Windows Hello, or a hardware security key.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm text-muted-foreground">
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

		<!-- Invitations -->
		<Card.Root class={pendingInvitationCount > 0 ? "ring-2 ring-primary" : ""}>
			<Card.Header>
				<div class="flex items-center gap-2">
					<Card.Title>Invitations</Card.Title>
					{#if pendingInvitationCount > 0}
						<Badge variant="destructive" class="h-5 min-w-5 px-1 text-xs">
							{pendingInvitationCount}
						</Badge>
					{/if}
				</div>
				<Card.Description
					>Organization invitations sent to you.</Card.Description
				>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#if invitationError}
					<p class="text-sm text-destructive" role="alert">{invitationError}</p>
				{/if}
				{#if $invitationsQuery.isPending}
					<p class="text-sm text-muted-foreground">Loading...</p>
				{:else if pendingInvitations.length > 0}
					<div class="space-y-2">
						{#each pendingInvitations as inv (inv.id)}
							<div
								class="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
							>
								<div class="space-y-1">
									<p class="text-sm font-medium">
										{inv.organizationName ?? "Organization"}
									</p>
									<div
										class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
									>
										<span>Role:</span>
										<Badge variant="secondary">{inv.role ?? "member"}</Badge>
										{#if inv.expiresAt}
											<span>&middot; Expires {formatDate(inv.expiresAt)}</span>
										{/if}
									</div>
								</div>
								<div class="flex gap-2">
									<Button
										size="sm"
										onclick={() => void handleAccept(inv.id)}
										disabled={pendingActionId === inv.id}
									>
										{pendingActionId === inv.id ? "Accepting..." : "Accept"}
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={() => void handleReject(inv.id)}
										disabled={pendingActionId === inv.id}
									>
										Reject
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">No pending invitations.</p>
				{/if}
				{#if pastInvitations.length > 0}
					<Separator />
					<p class="text-xs font-medium text-muted-foreground">Past</p>
					<div class="space-y-2">
						{#each pastInvitations as inv (inv.id)}
							<div
								class="flex items-center justify-between rounded-lg border p-3 text-sm"
							>
								<span class="font-medium"
									>{inv.organizationName ?? "Organization"}</span
								>
								<Badge
									variant={inv.status === "accepted" ? "default" : "outline"}
								>
									{inv.status}
								</Badge>
							</div>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Organizations -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Organizations</Card.Title>
				<Card.Description
					>Create or join organizations to collaborate.</Card.Description
				>
			</Card.Header>
			<Card.Footer>
				<Button href={resolve("/org/create")} variant="outline" size="sm">
					+ New Organization
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>
{/if}
