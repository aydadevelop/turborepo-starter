<script lang="ts">
	import * as Alert from "@my-app/ui/components/alert";
	import { Button } from "@my-app/ui/components/button";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import { createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import {
		getPageInitialSessionData,
		hasAuthenticatedSession,
		isSessionPending,
		resolveSessionData,
	} from "$lib/auth-session";
	import { orpc, queryClient } from "$lib/orpc";
	import { queryKeys } from "$lib/query-keys";
	import { userOrganizationsQueryOptions } from "$lib/query-options";
	import SurfaceCard from "../../../components/operator/SurfaceCard.svelte";

	let orgName = $state("");
	let pending = $state(false);
	let errorMessage = $state<string | null>(null);
	let consentChecked = $state(false);
	let scrolledToBottom = $state(false);

	const sessionQuery = authClient.useSession();
	const initialSession = $derived(getPageInitialSessionData(page.data));
	const sessionData = $derived(
		resolveSessionData($sessionQuery, initialSession)
	);
	const sessionPending = $derived(
		isSessionPending($sessionQuery, initialSession)
	);
	const defaultPostCreatePath = resolve("/dashboard/settings");

	const resolvePostCreateRedirect = (candidatePath: string | null): string => {
		if (!candidatePath) return defaultPostCreatePath;
		if (!candidatePath.startsWith("/") || candidatePath.startsWith("//")) {
			return defaultPostCreatePath;
		}
		if (candidatePath.startsWith(resolve("/org/create"))) {
			return defaultPostCreatePath;
		}
		return candidatePath;
	};

	const postCreateRedirectPath = $derived(
		resolvePostCreateRedirect(page.url.searchParams.get("next"))
	);

	const extractErrorMessage = (error: unknown, fallback: string): string => {
		if (error instanceof Error && error.message.trim().length > 0)
			return error.message;
		if (typeof error === "string" && error.trim().length > 0) return error;
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
		return fallback;
	};

	const toFriendlyOrgCreateError = (message: string): string => {
		const normalized = message.toLowerCase();
		if (
			normalized.includes("unauthorized") ||
			normalized.includes("forbidden")
		) {
			return "You need to sign in with an email account before creating an organization.";
		}
		return message;
	};

	$effect(() => {
		const user = sessionData?.user;
		if (user && !orgName) {
			orgName = user.name || user.email?.split("@")[0] || "";
		}
	});

	const orgsQuery = createQuery(() =>
		userOrganizationsQueryOptions({
			enabled: hasAuthenticatedSession(sessionData),
		})
	);

	const hasExistingOrg = $derived((orgsQuery.data?.length ?? 0) > 0);

	$effect(() => {
		if (sessionPending) return;
		if (!hasAuthenticatedSession(sessionData)) {
			goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
			);
		}
	});

	const handleScroll = (event: Event) => {
		const target = event.target as HTMLElement;
		const threshold = 50;
		if (
			target.scrollHeight - target.scrollTop - target.clientHeight <
			threshold
		) {
			scrolledToBottom = true;
		}
	};

	const handleSubmit = async () => {
		if (!hasAuthenticatedSession(sessionData)) {
			errorMessage =
				"You need to sign in with an email account before creating an organization.";
			return;
		}

		const trimmedName = orgName.trim();
		if (!trimmedName) {
			errorMessage = "Organization name is required.";
			return;
		}

		if (!consentChecked) {
			errorMessage = "You must accept the terms of service.";
			return;
		}

		pending = true;
		errorMessage = null;

		try {
			await orpc.consent.accept.call({
				consentTypes: ["service_agreement"],
			});

			const { data: createdOrganization, error } =
				await authClient.organization.create({
					name: trimmedName,
					slug: trimmedName
						.toLowerCase()
						.replace(/[^a-zа-яё0-9]+/gu, "-")
						.replace(/^-+|-+$/g, ""),
				});

			if (error) {
				errorMessage = toFriendlyOrgCreateError(
					extractErrorMessage(error, "Failed to create organization.")
				);
				pending = false;
				return;
			}

			const createdOrganizationId =
				(createdOrganization as { id?: string } | null)?.id ?? null;
			if (createdOrganizationId) {
				await authClient.organization.setActive({
					organizationId: createdOrganizationId,
				});

				queryClient.setQueryData(
					queryKeys.organizations.all,
					(currentOrganizations: unknown) => {
						if (
							Array.isArray(currentOrganizations) &&
							currentOrganizations.length > 0
						) {
							return currentOrganizations;
						}

						return createdOrganization ? [createdOrganization] : [];
					}
				);
			}

			await Promise.all([
				queryClient.invalidateQueries({ queryKey: queryKeys.org.root }),
				queryClient.invalidateQueries({
					queryKey: queryKeys.organizations.all,
				}),
				queryClient.invalidateQueries({
					queryKey: orpc.canManageOrganization.key(),
				}),
			]);

			const orgsResult = await authClient.organization.list();
			queryClient.setQueryData(
				queryKeys.organizations.all,
				orgsResult.data?.length
					? orgsResult.data
					: createdOrganization
						? [createdOrganization]
						: []
			);

			goto(postCreateRedirectPath, { replaceState: true });
		} catch (error) {
			errorMessage = toFriendlyOrgCreateError(
				extractErrorMessage(
					error,
					"An error occurred while creating the organization."
				)
			);
			pending = false;
		}
	};
</script>

<div class="mx-auto max-w-2xl px-6 py-10 space-y-6">
	<div class="text-center">
		<h1 class="text-3xl font-bold">Create Organization</h1>
		<p class="mt-2 text-muted-foreground">
			Create an organization to manage your workspace settings and team access
		</p>
	</div>

	{#if page.url.searchParams.get("reason") === "new"}
		<Alert.Root>
			<Alert.Title>Welcome! One more step</Alert.Title>
			<Alert.Description>
				Your account is ready. Create an organization to start managing your
				workspace.
			</Alert.Description>
		</Alert.Root>
	{:else if page.url.searchParams.get("reason") === "required"}
		<Alert.Root>
			<Alert.Title>Organization required</Alert.Title>
			<Alert.Description>
				You need an organization to access this area. Create one below to
				continue.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if hasExistingOrg}
		<div
			class="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm"
		>
			<span class="text-muted-foreground"
				>You already have an organization.</span
			>
			<Button
				variant="ghost"
				size="sm"
				onclick={() => goto(postCreateRedirectPath)}
			>
				Go to Settings
			</Button>
		</div>
	{/if}

	<SurfaceCard title="Organization details">
		{#snippet children()}
			<div class="space-y-2">
				<Label for="org-name">Organization name</Label>
				<Input
					id="org-name"
					type="text"
					placeholder="My game"
					data-testid="org-create-name-input"
					value={orgName}
					oninput={(event: Event) => (orgName = (event.target as HTMLInputElement).value)}
				/>
			</div>
		{/snippet}
	</SurfaceCard>

	<SurfaceCard
		title="Terms of Service Agreement"
		description="Please read and accept the agreement before creating your organization."
		action={undefined}
	>
		{#snippet children()}
			<div class="space-y-4">
				<div
					class="h-80 overflow-y-auto rounded-md border bg-muted/30 p-4 text-sm leading-relaxed"
					data-testid="org-create-terms-scroll"
					onscroll={handleScroll}
				>
					<p class="mb-4 font-bold">Terms of Service Agreement</p>
					<p class="mb-3">
						This Agreement governs the relationship between the User and the
						Service Provider in connection with the provision of workspace
						management services.
					</p>
					<p class="mb-3">
						The platform facilitates organization-level collaboration and
						workflow management on behalf of registered organizations.
					</p>
					<p class="mb-3">
						By creating an organization, the User agrees to the terms set forth
						in this Agreement and the platform's Privacy Policy.
					</p>
					<p class="mb-4 font-semibold">1. Acceptance</p>
					<p class="mb-3">
						1.1. Before creating an organization, the User must carefully read
						the terms of this Agreement. The User may not proceed if they do not
						agree to these terms.
					</p>
					<p class="mb-3">
						1.2. This Agreement is considered accepted at the moment the User
						submits the organization creation form.
					</p>
					<p class="mb-4 font-semibold">2. Subject Matter</p>
					<p class="mb-3">
						2.1. The Service Provider grants the User access to tools for
						managing tasks, reminders, notifications, and related operational
						workflows within the platform.
					</p>
					<p class="mb-4 font-semibold">3. Financial Terms</p>
					<p class="mb-3">
						3.1. Subscription pricing is listed on the Pricing page.
					</p>
					<p class="mb-3">
						3.2. Payment is required in full before access is granted.
					</p>
					<p class="mb-4 font-semibold">4. Cancellation and Refunds</p>
					<p class="mb-3">
						4.1. The User may cancel their subscription at any time. Access
						continues until the end of the current billing period.
					</p>
					<p class="mb-3">
						4.2. Refunds are handled on a case-by-case basis within 10 business
						days of the request.
					</p>
					<p class="mb-4 font-semibold">5. Liability</p>
					<p class="mb-3">
						5.1. Each party is responsible for fulfilling their obligations
						under this Agreement in accordance with applicable law.
					</p>
					<p class="mb-4 font-semibold">6. Personal Data</p>
					<p class="mb-3">
						6.1. Personal data is processed in accordance with the Privacy
						Policy and applicable data protection regulations.
					</p>
					<p class="mb-4 font-semibold">7. Governing Law</p>
					<p class="mb-3">
						7.1. Disputes shall first be resolved through negotiation. If no
						agreement is reached, disputes will be submitted to the competent
						court of jurisdiction.
					</p>
					<p class="mt-6 text-xs text-muted-foreground">
						Full agreement text available upon request. Document version:
						2026-02-14.
					</p>
				</div>

				<label class="flex cursor-pointer select-none items-start gap-3">
					<input
						type="checkbox"
						data-testid="org-create-consent-checkbox"
						class="mt-0.5 h-4 w-4 shrink-0 rounded border border-input accent-primary"
						checked={consentChecked}
						disabled={!scrolledToBottom}
						onchange={(event) => (consentChecked = (event.target as HTMLInputElement).checked)}
					>
					<span class="text-sm">
						{#if !scrolledToBottom}
							<span class="text-muted-foreground"
								>Scroll to the bottom to accept the terms</span
							>
						{:else}
							I have read and agree to the
							<span class="font-medium">Terms of Service Agreement</span>
						{/if}
					</span>
				</label>

				{#if errorMessage}
					<p class="text-sm text-destructive">{errorMessage}</p>
				{/if}

				<div class:justify-end={hasExistingOrg} class="flex">
					<Button
						variant={hasExistingOrg ? "outline" : "default"}
						data-testid="org-create-submit-button"
						onclick={() => void handleSubmit()}
						disabled={pending || !consentChecked || !orgName.trim()}
						class={hasExistingOrg ? "" : "w-full"}
					>
						{pending ? "Creating..." : "Create Organization"}
					</Button>
				</div>
			</div>
		{/snippet}
	</SurfaceCard>
</div>
