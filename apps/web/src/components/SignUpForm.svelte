<!-- biome-ignore-all format: TanStack Form component member syntax not supported -->
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
import { z } from "zod";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { page } from "$app/state";
import { authClient } from "$lib/auth-client";

let { switchToSignIn } = $props<{ switchToSignIn: () => void }>();

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

const validationSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters"),
	email: z.email("Invalid email address"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

const form = createForm(() => ({
	defaultValues: { name: "", email: "", password: "" },
	onSubmit: async ({ value }) => {
		submitError = null;
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
								{#each field.state.meta.errors as err}
									<p class="text-sm text-destructive" role="alert">
										{formatFormError(err)}
									</p>
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
								placeholder="••••••••"
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