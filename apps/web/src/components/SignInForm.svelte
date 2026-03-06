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
	import { onMount } from "svelte";
	import { z } from "zod";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import PhoneOtpForm from "./PhoneOtpForm.svelte";
	import TelegramLogin from "./TelegramLogin.svelte";

	let { switchToSignUp } = $props<{ switchToSignUp: () => void }>();

	type AuthMethod = "email" | "phone";
	type EmailField = "email" | "password";
	const LOCAL_PASSKEY_AUTOFILL_DISABLED_HOSTS = new Set([
		"localhost",
		"127.0.0.1",
	]);

	const validationSchema = z.object({
		email: z.email("Invalid email address"),
		password: z.string().min(1, "Password is required"),
	});

	let authMethod = $state<AuthMethod>("email");
	let email = $state("");
	let password = $state("");
	let touchedFields = $state<Record<EmailField, boolean>>({
		email: false,
		password: false,
	});
	let fieldErrors = $state<Record<EmailField, string | null>>({
		email: null,
		password: null,
	});
	let isSubmitting = $state(false);
	let passkeyError = $state<string | null>(null);
	let passkeyPending = $state(false);
	let submitError = $state<string | null>(null);

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

	const validateEmailField = (field: EmailField) => {
		const result = validationSchema.safeParse({
			email,
			password,
		});

		fieldErrors = {
			...fieldErrors,
			[field]: result.success
				? null
				: (result.error.flatten().fieldErrors[field]?.[0] ?? null),
		};
	};

	const validateEmailForm = () => {
		const result = validationSchema.safeParse({
			email,
			password,
		});

		if (result.success) {
			fieldErrors = {
				email: null,
				password: null,
			};
			return true;
		}

		const errors = result.error.flatten().fieldErrors;
		fieldErrors = {
			email: errors.email?.[0] ?? null,
			password: errors.password?.[0] ?? null,
		};
		touchedFields = {
			email: true,
			password: true,
		};
		return false;
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
				if (autoFill) return;
				passkeyError = error.message || "Passkey sign in failed.";
			}
		} catch {
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
		if (LOCAL_PASSKEY_AUTOFILL_DISABLED_HOSTS.has(window.location.hostname)) {
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

	const handleEmailSubmit = async () => {
		submitError = null;
		if (!validateEmailForm()) {
			return;
		}

		isSubmitting = true;
		try {
			await authClient.signIn.email(
				{ email: email.trim(), password },
				{
					onSuccess: () => {
						window.location.href = postAuthRedirectPath;
					},
					onError: (error) => {
						submitError = formatFormError(error);
					},
				}
			);
		} finally {
			isSubmitting = false;
		}
	};
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
					class={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
						authMethod === "email"
							? "bg-background shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
					onclick={() => (authMethod = "email")}
				>
					Email
				</button>
				<button
					type="button"
					class={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
						authMethod === "phone"
							? "bg-background shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
					onclick={() => (authMethod = "phone")}
				>
					Phone
				</button>
			</div>

			{#if authMethod === "email"}
				<form
					class="space-y-4"
					onsubmit={(event) => {
						event.preventDefault();
						void handleEmailSubmit();
					}}
				>
					<div class="space-y-2">
						<Label for="sign-in-email">Email</Label>
						<Input
							id="sign-in-email"
							name="email"
							type="email"
							autocomplete="username webauthn"
							placeholder="you@example.com"
							data-testid="login-email-input"
							value={email}
							onblur={() => {
								touchedFields.email = true;
								validateEmailField("email");
							}}
							oninput={(event: Event) => {
								email = (event.target as HTMLInputElement).value;
								if (touchedFields.email) {
									validateEmailField("email");
								}
							}}
						/>
						{#if touchedFields.email && fieldErrors.email}
							<p class="text-sm text-destructive" role="alert">
								{fieldErrors.email}
							</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="sign-in-password">Password</Label>
						<Input
							id="sign-in-password"
							name="password"
							type="password"
							autocomplete="current-password webauthn"
							placeholder="••••••••"
							data-testid="login-password-input"
							value={password}
							onblur={() => {
								touchedFields.password = true;
								validateEmailField("password");
							}}
							oninput={(event: Event) => {
								password = (event.target as HTMLInputElement).value;
								if (touchedFields.password) {
									validateEmailField("password");
								}
							}}
						/>
						{#if touchedFields.password && fieldErrors.password}
							<p class="text-sm text-destructive" role="alert">
								{fieldErrors.password}
							</p>
						{/if}
					</div>

					{#if submitError}
						<p class="text-sm text-destructive" role="alert">{submitError}</p>
					{/if}

					<Button
						type="submit"
						class="w-full"
						disabled={isSubmitting}
						data-testid="sign-in-submit-button"
					>
						{isSubmitting ? "Signing in..." : "Sign In"}
					</Button>
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
