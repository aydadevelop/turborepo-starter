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
	import { get } from "svelte/store";
	import { z } from "zod";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/stores";
	import { authClient } from "$lib/auth-client";

	let { switchToSignIn } = $props<{ switchToSignIn: () => void }>();

	const resolvePostAuthRedirect = (candidatePath: string | null): string => {
		if (!candidatePath) {
			return resolve("/dashboard");
		}
		if (!candidatePath.startsWith("/") || candidatePath.startsWith("//")) {
			return resolve("/dashboard");
		}
		return candidatePath;
	};

	const currentPage = get(page);
	const postAuthRedirectPath = resolvePostAuthRedirect(
		currentPage.url.searchParams.get("next")
	);

	const validationSchema = z.object({
		name: z.string().min(2, "Name must be at least 2 characters"),
		email: z.email("Invalid email address"),
		password: z.string().min(8, "Password must be at least 8 characters"),
	});

	const form = createForm(() => ({
		defaultValues: { name: "", email: "", password: "" },
		onSubmit: async ({ value }) => {
			await authClient.signUp.email(
				{
					email: value.email,
					password: value.password,
					name: value.name,
				},
				{
					onSuccess: () => {
						goto(postAuthRedirectPath);
					},
					onError: (error) => {
						console.error(
							error.error.message || "Sign up failed. Please try again."
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
			<CardTitle class="text-2xl">Create Account</CardTitle>
			<CardDescription>Sign up to get started</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				id="form"
				class="space-y-4"
				onsubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<form.Field name="name">
					{#snippet children(field)}
						<div class="space-y-2">
							<Label for={field.name}>Name</Label>
							<Input
								id={field.name}
								name={field.name}
								placeholder="John Doe"
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
							{state.isSubmitting ? "Creating account..." : "Sign Up"}
						</Button>
					{/snippet}
				</form.Subscribe>
			</form>
		</CardContent>
		<CardFooter class="justify-center">
			<Button variant="link" onclick={switchToSignIn}>
				Already have an account? Sign In
			</Button>
		</CardFooter>
	</Card>
</div>
