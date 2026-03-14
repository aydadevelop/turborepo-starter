<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@my-app/ui/components/card";
import { Input } from "@my-app/ui/components/input";
import { Label } from "@my-app/ui/components/label";
import { createForm } from "@tanstack/svelte-form";
import { onMount } from "svelte";
import { z } from "zod";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { page } from "$app/state";
import { authClient } from "$lib/auth-client";
import PhoneOtpForm from "./PhoneOtpForm.svelte";
import TelegramLogin from "./TelegramLogin.svelte";

let { switchToSignUp } = $props<{ switchToSignUp: () => void }>();

type AuthMethod = "email" | "phone";
let authMethod = $state<AuthMethod>("email");

const resolvePostAuthRedirect = (candidatePath: string | null): string => {
	if (!candidatePath) {
		return resolve("/dashboard/settings");
	}
	if (!candidatePath.startsWith("/") || candidatePath.startsWith("//")) {
		return resolve("/dashboard/settings");
	}
	return candidatePath;
};

const postAuthRedirectPath = $derived(
	resolvePostAuthRedirect(page.url.searchParams.get("next"))
);
let passkeyError = $state<string | null>(null);
let passkeyPending = $state(false);
let submitError = $state<string | null>(null);

const formatFormError = (error: unknown): string => {
	if (typeof error === "string" && error.trim().length > 0) {
		return error;
	}

	if (typeof error === "object" && error !== null) {
		const maybeError = error as {
			message?: unknown;
			error?: { message?: unknown };
		};
		if (
			typeof maybeError.error?.message === "string" &&
			maybeError.error.message.trim().length > 0
		) {
			return maybeError.error.message;
		}
		if (
			typeof maybeError.message === "string" &&
			maybeError.message.trim().length > 0
		) {
			return maybeError.message;
		}
	}

	return "Please check the form and try again.";
};

const handlePasskeySignIn = async (autoFill = false) => {
	if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
		passkeyError = "Passkeys are not supported in this browser.";
		return;
	}

	passkeyError = null;
	if (!autoFill) {
		passkeyPending = true;
	}
	try {
		let signInSucceeded = false;
		const { error } = await authClient.signIn.passkey({
			autoFill,
			fetchOptions: {
				onSuccess: () => {
					signInSucceeded = true;
					window.location.href = postAuthRedirectPath;
				},
			},
		});

		if (signInSucceeded) return;

		if (error) {
			// Conditional mediation errors (e.g. ceremony aborted) are expected
			if (autoFill) return;
			passkeyError = error.message || "Passkey sign in failed.";
		}
	} catch {
		// Conditional mediation can be aborted — don't surface those errors
		if (autoFill) return;
		passkeyError = "Passkey sign in failed.";
	} finally {
		passkeyPending = false;
	}
};

onMount(() => {
	if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
		return;
	}
	if (
		typeof PublicKeyCredential.isConditionalMediationAvailable !== "function"
	) {
		return;
	}

	PublicKeyCredential.isConditionalMediationAvailable()
		.then((isAvailable) => {
			if (!isAvailable) {
				return;
			}
			handlePasskeySignIn(true);
		})
		.catch(() => {
			// Ignore conditional UI probing errors and keep manual passkey login.
		});
});

const validationSchema = z.object({
	email: z.email("Invalid email address"),
	password: z.string().min(1, "Password is required"),
});

const form = createForm(() => ({
	defaultValues: { email: "", password: "" },
	onSubmit: async ({ value }) => {
		submitError = null;
		await authClient.signIn.email(
			{ email: value.email, password: value.password },
			{
				onSuccess: () => goto(postAuthRedirectPath),
				onError: (error) => {
					submitError = formatFormError(error);
				},
			}
		);
	},
	validators: {
		onSubmit: validationSchema,
	},
}));
</script>

<div class="mx-auto mt-10 w-full max-w-md p-6">
	<Card>
		<CardHeader class="text-center">
			<CardTitle class="text-2xl" data-testid="login-heading">
				Welcome Back
			</CardTitle>
			<CardDescription>Sign in to your account</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="flex gap-1 rounded-lg bg-muted p-1">
				<button
					type="button"
					class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {authMethod === 'email'
						? 'bg-background shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (authMethod = "email")}
				>
					Email
				</button>
				<button
					type="button"
					class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {authMethod === 'phone'
						? 'bg-background shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (authMethod = "phone")}
				>
					Phone
				</button>
			</div>

			{#if authMethod === "email"}
				<form
					class="space-y-4"
					onsubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					<form.Field name="email">
						{#snippet children(field)}
							<div class="space-y-2">
								<Label for={field.name}>Email</Label>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									autocomplete="username webauthn"
									placeholder="you@example.com"
									data-testid="login-email-input"
									onblur={field.handleBlur}
									value={field.state.value}
									oninput={(e: Event) => {
									const target = e.target as HTMLInputElement;
									field.handleChange(target.value);
								}}
								/>
								{#if field.state.meta.isTouched}
									{#each field.state.meta.errors as err}
										<p class="text-sm text-destructive" role="alert">
											{formatFormError(err)}
										</p>
									{/each}
								{/if}
							</div>
						{/snippet}
					</form.Field>

					<form.Field name="password">
						{#snippet children(field)}
							<div class="space-y-2">
								<Label for={field.name}>Password</Label>
								<Input
									id={field.name}
									name={field.name}
									type="password"
									autocomplete="current-password webauthn"
									placeholder="••••••••"
									data-testid="login-password-input"
									onblur={field.handleBlur}
									value={field.state.value}
									oninput={(e: Event) => {
									const target = e.target as HTMLInputElement;
									field.handleChange(target.value);
								}}
								/>
								{#if field.state.meta.isTouched}
									{#each field.state.meta.errors as err}
										<p class="text-sm text-destructive" role="alert">
											{formatFormError(err)}
										</p>
									{/each}
								{/if}
							</div>
						{/snippet}
					</form.Field>
					{#if submitError}
						<p class="text-sm text-destructive" role="alert">{submitError}</p>
					{/if}

					<form.Subscribe
						selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
					>
						{#snippet children(state)}
							<Button
								type="submit"
								class="w-full"
								disabled={!state.canSubmit || state.isSubmitting}
								data-testid="sign-in-submit-button"
							>
								{state.isSubmitting ? "Signing in..." : "Sign In"}
							</Button>
						{/snippet}
					</form.Subscribe>
				</form>
			{:else}
				<PhoneOtpForm {postAuthRedirectPath} />
			{/if}

			<div class="relative py-1">
				<div class="absolute inset-x-0 top-1/2 border-t border-border"></div>
				<span
					class="relative mx-auto block w-fit bg-card px-2 text-xs text-muted-foreground"
				>
					or continue with
				</span>
			</div>

			<Button
				type="button"
				variant="outline"
				class="w-full"
				disabled={passkeyPending}
				onclick={() => void handlePasskeySignIn(false)}
			>
				{passkeyPending ? "Waiting for passkey..." : "Sign In with Passkey"}
			</Button>
			{#if passkeyError}
				<p class="text-sm text-destructive" role="alert">{passkeyError}</p>
			{/if}

			<TelegramLogin {postAuthRedirectPath} />
		</CardContent>
		<CardFooter class="justify-center">
			<Button
				variant="link"
				onclick={switchToSignUp}
				data-testid="switch-to-sign-up-button"
			>
				Need an account? Sign Up
			</Button>
		</CardFooter>
	</Card>
</div>