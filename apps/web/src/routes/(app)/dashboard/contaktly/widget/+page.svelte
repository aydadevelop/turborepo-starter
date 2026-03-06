<script lang="ts">
	import {
		createEmbedSnippet,
		DEMO_WIDGET_CONFIG_ID,
	} from "@my-app/contaktly-widget";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Input } from "@my-app/ui/components/input";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { page } from "$app/state";
	import { env } from "$env/dynamic/public";
	import { orpc } from "$lib/orpc";

	const GOOGLE_CALENDAR_OAUTH_SCOPES = [
		"https://www.googleapis.com/auth/calendar.events",
		"https://www.googleapis.com/auth/calendar.readonly",
	];
	const TRAILING_SLASHES = /\/+$/;
	const ABSOLUTE_URL = /^https?:\/\//;
	const DEFAULT_SERVER_URL = "http://localhost:3000";

	function resolveServerUrl(): string {
		const raw = (env.PUBLIC_SERVER_URL ?? DEFAULT_SERVER_URL).replace(
			TRAILING_SLASHES,
			""
		);

		if (ABSOLUTE_URL.test(raw)) {
			return raw;
		}

		if (typeof window === "undefined") {
			return DEFAULT_SERVER_URL;
		}

		return `${window.location.origin}${raw}`;
	}

	const widgetUrl = $derived(env.PUBLIC_WIDGET_URL || "http://localhost:5174");
	const serverUrl = $derived(resolveServerUrl());
	const widgetConfigQuery = createQuery(() =>
		orpc.contaktly.getWidgetConfig.queryOptions({
			input: { configId: DEMO_WIDGET_CONFIG_ID },
		})
	);

	const updateWidgetConfigMutation = createMutation(() =>
		orpc.contaktly.updateWidgetConfig.mutationOptions({
			onMutate: () => {
				saveStatus = "Saving...";
			},
			onSuccess: (config) => {
				bookingUrlDraft = config.bookingUrl;
				lastLoadedBookingUrl = config.bookingUrl;
				saveStatus = "Saved";
				widgetConfigQuery.refetch();
			},
			onError: (error) => {
				saveStatus = error.message || "Failed to save booking URL";
			},
		})
	);

	let bookingUrlDraft = $state("");
	let lastLoadedBookingUrl = $state("");
	let saveStatus = $state("");
	let googleCalendarFeedback = $state("");
	let googleOAuthPending = $state(false);
	let handledGoogleOAuthCallback = $state(false);

	const widgetConfig = $derived(widgetConfigQuery.data);
	const currentConfigId = $derived(
		widgetConfig?.configId ?? DEMO_WIDGET_CONFIG_ID
	);
	const googleCalendarQuery = createQuery(() =>
		orpc.contaktly.getGoogleCalendarConnection.queryOptions({
			input: { configId: currentConfigId },
		})
	);
	const connectGoogleCalendarMutation = createMutation(() =>
		orpc.contaktly.connectGoogleCalendar.mutationOptions({
			onMutate: () => {
				googleCalendarFeedback = "Connecting Google Calendar...";
			},
			onSuccess: () => {
				googleCalendarFeedback = "Google Calendar connected.";
				googleCalendarQuery.refetch();
			},
			onError: (error) => {
				googleCalendarFeedback =
					error.message || "Failed to connect Google Calendar.";
			},
		})
	);
	const googleCalendar = $derived(googleCalendarQuery.data);
	const currentBookingUrl = $derived(
		widgetConfig?.bookingUrl ?? "https://calendly.com/"
	);
	const currentAllowedDomains = $derived(widgetConfig?.allowedDomains ?? []);
	const snippet = $derived(
		createEmbedSnippet({
			baseUrl: widgetUrl,
			configId: currentConfigId,
			tags: ["astro-site", "founder-led"],
		})
	);

	$effect(() => {
		const nextBookingUrl = widgetConfig?.bookingUrl;

		if (
			nextBookingUrl &&
			(bookingUrlDraft === "" || bookingUrlDraft === lastLoadedBookingUrl)
		) {
			bookingUrlDraft = nextBookingUrl;
			lastLoadedBookingUrl = nextBookingUrl;
		}
	});

	const canSaveBookingUrl = $derived(
		Boolean(
			bookingUrlDraft.trim() &&
				bookingUrlDraft.trim() !== currentBookingUrl &&
				!updateWidgetConfigMutation.isPending
		)
	);
	const googleCalendarStatusText = $derived.by(() => {
		if (connectGoogleCalendarMutation.isPending || googleOAuthPending) {
			return "Connecting Google Calendar...";
		}

		switch (googleCalendar?.status) {
			case "connected":
				return "Connected";
			case "linked_account":
				return "Linked Google account ready";
			case "missing_scope":
				return "Google account linked but missing calendar scopes";
			case "not_linked":
				return googleCalendar.oauthConfigured
					? "Google account not linked yet"
					: "Google OAuth is not configured";
			default:
				return "Loading Google Calendar status...";
		}
	});
	const googleCalendarButtonLabel = $derived.by(() => {
		switch (googleCalendar?.status) {
			case "connected":
				return "Refresh Google Calendar Access";
			case "linked_account":
				return "Connect Google Calendar";
			case "missing_scope":
				return "Grant Calendar Access";
			case "not_linked":
				return googleCalendar.oauthConfigured
					? "Link Google Account"
					: "Google OAuth not configured";
			default:
				return "Connect Google Calendar";
		}
	});
	const isGoogleCalendarActionDisabled = $derived(
		connectGoogleCalendarMutation.isPending ||
			googleOAuthPending ||
			(googleCalendar?.status === "not_linked" &&
				!googleCalendar?.oauthConfigured)
	);

	function handleSaveBookingUrl(event: SubmitEvent) {
		event.preventDefault();
		const nextBookingUrl = bookingUrlDraft.trim();

		if (!nextBookingUrl || updateWidgetConfigMutation.isPending) {
			return;
		}

		updateWidgetConfigMutation.mutate({
			configId: currentConfigId,
			bookingUrl: nextBookingUrl,
		});
	}

	async function handleGoogleCalendarConnect() {
		if (
			connectGoogleCalendarMutation.isPending ||
			googleOAuthPending ||
			!googleCalendar
		) {
			return;
		}

		if (
			googleCalendar.status === "linked_account" ||
			googleCalendar.status === "connected"
		) {
			connectGoogleCalendarMutation.mutate({
				configId: currentConfigId,
			});
			return;
		}

		if (!googleCalendar.oauthConfigured) {
			googleCalendarFeedback =
				"Google OAuth credentials are not configured on the server.";
			return;
		}

		googleOAuthPending = true;
		googleCalendarFeedback = "Opening Google OAuth...";

		const callbackURL = `${window.location.origin}${page.url.pathname}?googleCalendar=linked`;
		const response = await fetch(`${serverUrl}/api/auth/link-social`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			credentials: "include",
			body: JSON.stringify({
				provider: "google",
				callbackURL,
				disableRedirect: true,
				scopes: GOOGLE_CALENDAR_OAUTH_SCOPES,
			}),
		});
		const result = (await response.json()) as {
			message?: string;
			redirect?: boolean;
			url?: string;
		};
		googleOAuthPending = false;

		if (!response.ok) {
			googleCalendarFeedback =
				result.message || "Failed to start Google OAuth.";
			return;
		}

		if (result.url) {
			window.location.assign(result.url);
		}
	}

	$effect(() => {
		const shouldAutoConnect =
			page.url.searchParams.get("googleCalendar") === "linked" &&
			googleCalendar?.status === "linked_account" &&
			!connectGoogleCalendarMutation.isPending &&
			!handledGoogleOAuthCallback;

		if (!shouldAutoConnect) {
			return;
		}

		handledGoogleOAuthCallback = true;
		connectGoogleCalendarMutation.mutate({
			configId: currentConfigId,
		});
	});
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
	<div class="space-y-2" data-testid="contaktly-widget-heading">
		<p class="text-sm uppercase tracking-[0.3em] text-primary">
			Widget Delivery
		</p>
		<h1 class="text-3xl font-semibold tracking-tight">First shipping slice</h1>
		<p class="max-w-3xl text-muted-foreground">
			The widget app now owns the public host page, iframe runtime, and
			embeddable loader. This admin page publishes the config id and script
			snippet needed for demos and fixture sites.
		</p>
	</div>

	<div class="grid gap-5 md:grid-cols-2">
		<Card.Root data-testid="contaktly-widget-public-config">
			<Card.Header>
				<Card.Title>Public Config</Card.Title>
				<Card.Description
					>Hardcoded demo config for the first slice</Card.Description
				>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm">
				<p data-testid="contaktly-widget-config-id">
					<strong>config id:</strong>
					<span class="font-mono">{currentConfigId}</span>
				</p>
				<p data-testid="contaktly-widget-app-url">
					<strong>widget app:</strong>
					<span class="font-mono">{widgetUrl}</span>
				</p>
				<p data-testid="contaktly-widget-allowed-domains">
					<strong>allowed domains:</strong>
					<span class="font-mono">{currentAllowedDomains.join(", ")}</span>
				</p>
			</Card.Content>
			<Card.Footer class="flex gap-3">
				<Button
					href={`${widgetUrl}/widget?params=${currentConfigId}&tags=demo,founder`}
					target="_blank"
				>
					Open /widget host page
				</Button>
			</Card.Footer>
		</Card.Root>

		<Card.Root data-testid="contaktly-widget-snippet-card">
			<Card.Header>
				<Card.Title>Embed Snippet</Card.Title>
				<Card.Description>Use this on the Astro fixture site</Card.Description>
			</Card.Header>
			<Card.Content>
				<pre
					data-testid="contaktly-widget-snippet"
					class="overflow-x-auto rounded-2xl bg-muted p-4 text-xs leading-6"
				>{snippet}</pre>
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root data-testid="contaktly-widget-booking-card">
		<Card.Header>
			<Card.Title>Booking URL</Card.Title>
			<Card.Description>
				POC calendar path: save a manual booking URL before Google OAuth.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<form
				class="space-y-3"
				data-testid="contaktly-booking-url-form"
				onsubmit={handleSaveBookingUrl}
			>
				<label class="space-y-2">
					<span class="text-sm font-medium">Booking URL</span>
					<Input
						bind:value={bookingUrlDraft}
						data-testid="contaktly-booking-url-input"
						placeholder="https://calendly.com/your-team/intro"
						type="url"
					/>
				</label>
				<div class="flex items-center gap-3">
					<Button disabled={!canSaveBookingUrl} type="submit">
						Save booking URL
					</Button>
					<p
						class="text-sm text-muted-foreground"
						data-testid="contaktly-booking-url-status"
					>
						{saveStatus || "Current value is loaded from the persisted widget config."}
					</p>
				</div>
			</form>
			<p class="text-sm text-muted-foreground">
				Current widget CTA target:
				<span class="font-mono">{currentBookingUrl}</span>
			</p>
		</Card.Content>
	</Card.Root>

	<Card.Root data-testid="contaktly-google-calendar-card">
		<Card.Header>
			<Card.Title>Google Calendar</Card.Title>
			<Card.Description>
				MVP calendar path: link Google OAuth and persist one workspace calendar
				connection.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="space-y-2 text-sm text-muted-foreground">
				<p data-testid="contaktly-google-calendar-status">
					<strong>Status:</strong> {googleCalendarStatusText}
				</p>
				<p data-testid="contaktly-google-calendar-email">
					<strong>Account:</strong>
					<span class="font-mono"
						>{googleCalendar?.accountEmail ?? "Not linked"}</span
					>
				</p>
				<p data-testid="contaktly-google-calendar-calendar-id">
					<strong>Calendar:</strong>
					<span class="font-mono"
						>{googleCalendar?.calendarId ?? "Not connected"}</span
					>
				</p>
				<p data-testid="contaktly-google-calendar-scopes">
					<strong>Scopes:</strong>
					<span class="font-mono">
						{googleCalendar?.scopes.length
							? googleCalendar.scopes.join(", ")
							: "No Google calendar scopes stored yet"}
					</span>
				</p>
			</div>
			<div class="flex items-center gap-3">
				<Button
					disabled={isGoogleCalendarActionDisabled}
					onclick={() => void handleGoogleCalendarConnect()}
					type="button"
				>
					{googleCalendarButtonLabel}
				</Button>
				<p class="text-sm text-muted-foreground">
					{googleCalendarFeedback ||
						"The linked Google account remains in Better Auth. Contaktly stores only the active workspace binding."}
				</p>
			</div>
		</Card.Content>
	</Card.Root>
</div>
