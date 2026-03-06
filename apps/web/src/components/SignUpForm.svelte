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
	import { z } from "zod";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import { queryClient } from "$lib/orpc";
	import { queryKeys } from "$lib/query-keys";

	let { switchToSignIn } = $props<{ switchToSignIn: () => void }>();

	type SignUpField = "email" | "name" | "password";

	const validationSchema = z.object({
		name: z.string().min(2, "Name must be at least 2 characters"),
		email: z.email("Invalid email address"),
		password: z.string().min(8, "Password must be at least 8 characters"),
	});

	let name = $state("");
	let email = $state("");
	let password = $state("");
	let isSubmitting = $state(false);
	let submitError = $state<string | null>(null);
	let touchedFields = $state<Record<SignUpField, boolean>>({
		email: false,
		name: false,
		password: false,
	});
	let fieldErrors = $state<Record<SignUpField, string | null>>({
		email: null,
		name: null,
		password: null,
	});

	const resolvePostAuthRedirect = (candidatePath: string | null): string => {
		if (!candidatePath) {
			return `${resolve("/org/create")}?reason=new`;
		}
		if (!candidatePath.startsWith("/") || candidatePath.startsWith("//")) {
			return `${resolve("/org/create")}?reason=new`;
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

	const validateField = (field: SignUpField) => {
		const result = validationSchema.safeParse({ email, name, password });
		fieldErrors = {
			...fieldErrors,
			[field]: result.success
				? null
				: (result.error.flatten().fieldErrors[field]?.[0] ?? null),
		};
	};

	const validateForm = () => {
		const result = validationSchema.safeParse({ email, name, password });
		if (result.success) {
			fieldErrors = {
				email: null,
				name: null,
				password: null,
			};
			return true;
		}

		const errors = result.error.flatten().fieldErrors;
		fieldErrors = {
			email: errors.email?.[0] ?? null,
			name: errors.name?.[0] ?? null,
			password: errors.password?.[0] ?? null,
		};
		touchedFields = {
			email: true,
			name: true,
			password: true,
		};
		return false;
	};

	const handleSignUp = async () => {
		submitError = null;
		if (!validateForm()) {
			return;
		}

		isSubmitting = true;
		try {
			await authClient.signUp.email(
				{
					email: email.trim(),
					password,
					name: name.trim(),
				},
				{
					onSuccess: async () => {
						await Promise.all([
							queryClient.invalidateQueries({ queryKey: queryKeys.org.root }),
							queryClient.invalidateQueries({ queryKey: queryKeys.org.full }),
							queryClient.invalidateQueries({
								queryKey: queryKeys.organizations.all,
							}),
							queryClient.invalidateQueries({
								queryKey: queryKeys.org.canManage,
							}),
							queryClient.invalidateQueries({
								queryKey: queryKeys.invitations.all,
							}),
						]);
						goto(postAuthRedirectPath);
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
			<CardTitle class="text-2xl">Create Account</CardTitle>
			<CardDescription>Sign up to get started</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();
					void handleSignUp();
				}}
			>
				<div class="space-y-2">
					<Label for="sign-up-name">Name</Label>
					<Input
						id="sign-up-name"
						name="name"
						placeholder="John Doe"
						value={name}
						onblur={() => {
							touchedFields.name = true;
							validateField("name");
						}}
						oninput={(event: Event) => {
							name = (event.target as HTMLInputElement).value;
							if (touchedFields.name) {
								validateField("name");
							}
						}}
					/>
					{#if touchedFields.name && fieldErrors.name}
						<p class="text-sm text-destructive" role="alert">
							{fieldErrors.name}
						</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="sign-up-email">Email</Label>
					<Input
						id="sign-up-email"
						name="email"
						type="email"
						placeholder="you@example.com"
						value={email}
						onblur={() => {
							touchedFields.email = true;
							validateField("email");
						}}
						oninput={(event: Event) => {
							email = (event.target as HTMLInputElement).value;
							if (touchedFields.email) {
								validateField("email");
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
					<Label for="sign-up-password">Password</Label>
					<Input
						id="sign-up-password"
						name="password"
						type="password"
						placeholder="••••••••"
						value={password}
						onblur={() => {
							touchedFields.password = true;
							validateField("password");
						}}
						oninput={(event: Event) => {
							password = (event.target as HTMLInputElement).value;
							if (touchedFields.password) {
								validateField("password");
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

				<Button type="submit" class="w-full" disabled={isSubmitting}>
					{isSubmitting ? "Creating account..." : "Sign Up"}
				</Button>
			</form>
		</CardContent>
		<CardFooter class="justify-center">
			<Button variant="link" onclick={switchToSignIn}>
				Already have an account? Sign In
			</Button>
		</CardFooter>
	</Card>
</div>
