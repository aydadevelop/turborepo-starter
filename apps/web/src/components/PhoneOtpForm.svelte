<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
import { Input } from "@my-app/ui/components/input";
import { Label } from "@my-app/ui/components/label";
import { authClient } from "$lib/auth-client";
import PhoneInput from "./PhoneInput.svelte";

const { postAuthRedirectPath }: { postAuthRedirectPath: string } = $props();

let phone = $state("");
let phoneUnmasked = $state("");
let code = $state("");
let step = $state<"phone" | "otp">("phone");
let pending = $state(false);
let error = $state<string | null>(null);

const fullPhone = $derived(phoneUnmasked ? `+${phoneUnmasked}` : "");

const handleSendOtp = async () => {
	if (!fullPhone) {
		error = "Phone number is required.";
		return;
	}
	pending = true;
	error = null;
	try {
		const result = await authClient.phoneNumber.sendOtp({
			phoneNumber: fullPhone,
		});
		if (result.error) {
			error = result.error.message || "Failed to send OTP.";
			return;
		}
		step = "otp";
	} catch {
		error = "Failed to send OTP.";
	} finally {
		pending = false;
	}
};

const handleVerifyOtp = async () => {
	if (!code.trim()) {
		error = "Enter the verification code.";
		return;
	}
	pending = true;
	error = null;
	try {
		const result = await authClient.phoneNumber.verify({
			phoneNumber: fullPhone,
			code: code.trim(),
		});
		if (result.error) {
			error = result.error.message || "Invalid code.";
			return;
		}
		window.location.href = postAuthRedirectPath;
	} catch {
		error = "Verification failed.";
	} finally {
		pending = false;
	}
};
</script>

<div class="space-y-4">
	{#if step === "phone"}
		<div class="space-y-2">
			<Label for="phone">Phone Number</Label>
			<PhoneInput bind:value={phone} bind:unmasked={phoneUnmasked} />
		</div>
		<Button
			class="w-full"
			disabled={pending || !phoneUnmasked}
			onclick={() => void handleSendOtp()}
		>
			{pending ? "Sending code..." : "Send Verification Code"}
		</Button>
	{:else}
		<p class="text-center text-sm text-muted-foreground">
			Code sent to <strong>{phone}</strong>
		</p>
		<div class="space-y-2">
			<Label for="otp-code">Verification Code</Label>
			<Input
				id="otp-code"
				type="text"
				inputmode="numeric"
				placeholder="123456"
				maxlength={6}
				bind:value={code}
			/>
		</div>
		<Button
			class="w-full"
			disabled={pending}
			onclick={() => void handleVerifyOtp()}
		>
			{pending ? "Verifying..." : "Verify & Sign In"}
		</Button>
		<Button
			variant="ghost"
			class="w-full"
			onclick={() => {
				step = "phone";
				code = "";
				error = null;
			}}
		>
			Change phone number
		</Button>
	{/if}
	{#if error}
		<p class="text-sm text-destructive" role="alert">{error}</p>
	{/if}
</div>
