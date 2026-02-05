<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle,
	} from "@full-stack-cf-app/ui/components/card";
	import { Input } from "@full-stack-cf-app/ui/components/input";
	import { Label } from "@full-stack-cf-app/ui/components/label";
	import { createForm } from "@tanstack/svelte-form";
	import { z } from "zod";
	import { goto } from "$app/navigation";
	import { authClient } from "$lib/auth-client";

	let { switchToSignUp } = $props<{ switchToSignUp: () => void }>();

	const validationSchema = z.object({
		email: z.email("Invalid email address"),
		password: z.string().min(1, "Password is required"),
	});

	const form = createForm(() => ({
		defaultValues: { email: "", password: "" },
		onSubmit: async ({ value }) => {
			await authClient.signIn.email(
				{ email: value.email, password: value.password },
				{
					onSuccess: () => goto("/dashboard"),
					onError: (error) => {
						console.error(
							error.error.message || "Sign in failed. Please try again."
						);
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
			<CardTitle class="text-2xl">Welcome Back</CardTitle>
			<CardDescription>Sign in to your account</CardDescription>
		</CardHeader>
		<CardContent>
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
								placeholder="you@example.com"
								onblur={field.handleBlur}
								value={field.state.value}
								oninput={(e: Event) => {
									const target = e.target as HTMLInputElement;
									field.handleChange(target.value);
								}}
							/>
							{#if field.state.meta.isTouched}
								{#each field.state.meta.errors as error}
									<p class="text-sm text-destructive" role="alert">{error}</p>
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
								placeholder="••••••••"
								onblur={field.handleBlur}
								value={field.state.value}
								oninput={(e: Event) => {
									const target = e.target as HTMLInputElement;
									field.handleChange(target.value);
								}}
							/>
							{#if field.state.meta.isTouched}
								{#each field.state.meta.errors as error}
									<p class="text-sm text-destructive" role="alert">{error}</p>
								{/each}
							{/if}
						</div>
					{/snippet}
				</form.Field>

				<form.Subscribe
					selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
				>
					{#snippet children(state)}
						<Button
							type="submit"
							class="w-full"
							disabled={!state.canSubmit || state.isSubmitting}
						>
							{state.isSubmitting ? "Signing in..." : "Sign In"}
						</Button>
					{/snippet}
				</form.Subscribe>
			</form>
		</CardContent>
		<CardFooter class="justify-center">
			<Button variant="link" onclick={switchToSignUp}>
				Need an account? Sign Up
			</Button>
		</CardFooter>
	</Card>
</div>
