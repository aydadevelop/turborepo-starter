<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import { Input } from "@my-app/ui/components/input";
	import { Separator } from "@my-app/ui/components/separator";
	import { createQuery } from "@tanstack/svelte-query";
	import { onMount } from "svelte";
	import { authClient } from "$lib/auth-client";
	import { queryClient } from "$lib/orpc";
	import { queryKeys } from "$lib/query-keys";
	import { linkedAccountsQueryOptions } from "$lib/query-options";
	import PhoneInput from "../../components/PhoneInput.svelte";
	import AccountSettingsSection from "./AccountSettingsSection.svelte";

	type UserProfile = {
		phoneNumber?: string | null;
		telegramUsername?: string | null;
	};

	let {
		user,
		enabled,
	}: {
		user: UserProfile | null | undefined;
		enabled: boolean;
	} = $props();

	const accountsQuery = createQuery(() =>
		linkedAccountsQueryOptions({
			enabled,
		})
	);

	const hasTelegram = $derived(
		(accountsQuery.data ?? []).some(
			(a: { providerId?: string; provider?: string }) =>
				a.providerId === "telegram" || a.provider === "telegram"
		)
	);
	const hasCredential = $derived(
		(accountsQuery.data ?? []).some(
			(a: { providerId?: string; provider?: string }) =>
				a.providerId === "credential" || a.provider === "credential"
		)
	);
	const phoneNumber = $derived(user?.phoneNumber ?? null);
	const telegramUsername = $derived(user?.telegramUsername ?? null);

	let telegramPending = $state(false);
	let telegramError = $state<string | null>(null);
	let telegramSuccess = $state<string | null>(null);
	let telegramWidgetReady = $state(false);
	let showTelegramWidget = $state(false);

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

	$effect(() => {
		if (showTelegramWidget && telegramWidgetReady) {
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
</script>

<AccountSettingsSection
	title="Linked Accounts"
	description="Manage sign-in methods linked to your account."
>
	{#snippet children()}
		{#if accountsQuery.isPending}
			<p class="text-sm text-muted-foreground">Loading...</p>
		{:else}
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

			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<span class="text-sm font-medium">Telegram</span>
						{#if hasTelegram}
							<Badge variant="secondary">Connected</Badge>
							{#if telegramUsername}
								<span class="text-xs text-muted-foreground">@{telegramUsername}</span>
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
					<p class="text-sm text-destructive" role="alert">{telegramError}</p>
				{/if}
			</div>

			<Separator />

			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<span class="text-sm font-medium">Phone</span>
						{#if phoneNumber}
							<Badge variant="secondary">Connected</Badge>
							<span class="text-xs text-muted-foreground">{phoneNumber}</span>
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
	{/snippet}
</AccountSettingsSection>
