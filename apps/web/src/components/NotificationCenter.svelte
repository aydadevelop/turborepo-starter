<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
import { consumeEventIterator } from "@orpc/client";
import { createMutation, createQuery } from "@tanstack/svelte-query";
import { onMount, untrack } from "svelte";
import { writable } from "svelte/store";
import { resolve } from "$app/paths";
import type { authClient } from "$lib/auth-client";
import { getAuthenticatedUserId } from "$lib/auth-session";
import {
	countUnreadNotifications,
	deriveCursorMs,
	formatNotificationDateTime,
	type InAppNotificationItem,
	markNotificationsViewedLocally,
	mergeNotificationItems,
	type NotificationStreamState,
	notificationSeverityClass,
	sortNotificationsByDeliveredAtDesc,
	streamStateLabel,
} from "$lib/notification-center";
import { client, orpc } from "$lib/orpc";

// Session is passed from Header to avoid a second concurrent useSession()
// subscription — two independent subscriptions cause duplicate session-change
// renders across Header + NotificationCenter on every auth tick.
const {
	sessionQuery,
}: { sessionQuery: ReturnType<typeof authClient.useSession> } = $props();

const MAX_ITEMS = 20;
// Use $derived.by() + writable store so that $sessionQuery is tracked
// via Svelte 5 auto-subscription rather than Svelte 3/4 derived() stores,
// keeping the pattern consistent with the rest of the codebase.
const notificationsQueryOpts = $derived.by(() =>
	orpc.notifications.listMe.queryOptions({
		input: { limit: MAX_ITEMS },
		enabled: Boolean(getAuthenticatedUserId($sessionQuery.data)),
	})
);
const notificationsQueryOptsStore = writable(
	untrack(() => notificationsQueryOpts)
);
$effect(() => {
	notificationsQueryOptsStore.set(notificationsQueryOpts);
});
const notificationsQuery = createQuery(notificationsQueryOptsStore);
const markViewedMutation = createMutation(
	orpc.notifications.markViewed.mutationOptions({
		onSuccess: () => {
			$notificationsQuery.refetch();
		},
		onError: (error) => {
			setLoadError(error, "Failed to update notification");
		},
	})
);
const markAllViewedMutation = createMutation(
	orpc.notifications.markAllViewed.mutationOptions({
		onSuccess: () => {
			$notificationsQuery.refetch();
		},
		onError: (error) => {
			setLoadError(error, "Failed to mark notifications as viewed");
		},
	})
);

let containerEl = $state<HTMLDivElement | null>(null);
let isOpen = $state(false);
let loadError = $state<string | null>(null);
let streamState = $state<NotificationStreamState>("idle");
let notifications = $state<InAppNotificationItem[]>([]);
let unreadCount = $state(0);
let currentUserId = $state<string | null>(null);
let cursorMs = $state(0);
let stopStream: (() => Promise<void>) | null = null;
const isLoading = $derived(
	$notificationsQuery.isPending && notifications.length === 0
);

function setLoadError(error: unknown, fallback: string) {
	loadError = error instanceof Error ? error.message : fallback;
}

function syncDerivedStateFromNotifications() {
	cursorMs = deriveCursorMs(notifications, cursorMs);
	unreadCount = countUnreadNotifications(notifications);
}

function closeStream() {
	if (stopStream) {
		stopStream().catch((error) => {
			console.error("Failed to stop notifications stream", error);
		});
		stopStream = null;
	}
	streamState = "idle";
}

function startStream() {
	if (!currentUserId || stopStream) {
		return;
	}

	streamState = "connecting";
	stopStream = consumeEventIterator(
		client.notifications.streamMe({
			limit: 20,
			since: cursorMs > 0 ? cursorMs : undefined,
		}),
		{
			onEvent: (event) => {
				streamState = "connected";
				if (event.kind === "ready") {
					if (event.since > 0) {
						cursorMs = Math.max(cursorMs, event.since);
					}
					return;
				}

				if (event.kind === "snapshot" && event.scope === "me") {
					const items = event.items as InAppNotificationItem[];
					notifications = mergeNotificationItems(notifications, items);
					syncDerivedStateFromNotifications();
					if (event.since > 0) {
						cursorMs = Math.max(cursorMs, event.since);
					}
				}
			},
			onError: (error) => {
				console.error("Notifications stream failed", error);
				streamState = "error";
			},
			onFinish: () => {
				stopStream = null;
			},
		}
	);
}

function markLocallyViewed(notificationIds: string[]) {
	notifications = markNotificationsViewedLocally(
		notifications,
		notificationIds
	);
	unreadCount = countUnreadNotifications(notifications);
}

function markAllAsViewed() {
	const unreadIds = notifications
		.filter((item) => !item.viewedAt)
		.map((item) => item.id);
	if (unreadIds.length === 0) {
		return;
	}

	markLocallyViewed(unreadIds);
	$markAllViewedMutation.mutate({});
}

function markOneAsViewed(notificationId: string) {
	const item = notifications.find((entry) => entry.id === notificationId);
	if (!item || item.viewedAt) {
		return;
	}

	markLocallyViewed([notificationId]);
	$markViewedMutation.mutate({
		notificationIds: [notificationId],
	});
}

async function openPanel() {
	if (isOpen) {
		return;
	}

	isOpen = true;
	loadError = null;
	try {
		await $notificationsQuery.refetch();
	} catch (error) {
		setLoadError(error, "Failed to load notifications");
	}
	markAllAsViewed();
}

function closePanel() {
	isOpen = false;
}

function togglePanel() {
	if (isOpen) {
		closePanel();
		return;
	}
	openPanel().catch((error) => {
		setLoadError(error, "Failed to open notifications");
	});
}

function handleNotificationClick(notificationId: string) {
	markOneAsViewed(notificationId);
	closePanel();
}

function handleMarkAllClick() {
	markAllAsViewed();
}

function handleDocumentPointerDown(event: Event) {
	if (!(isOpen && containerEl)) {
		return;
	}

	const target = event.target;
	if (!(target instanceof Node)) {
		return;
	}

	if (!containerEl.contains(target)) {
		closePanel();
	}
}

function resetState() {
	closeStream();
	isOpen = false;
	loadError = null;
	notifications = [];
	unreadCount = 0;
	cursorMs = 0;
}

$effect(() => {
	const nextUserId = getAuthenticatedUserId($sessionQuery.data);
	if (nextUserId === currentUserId) {
		return;
	}
	currentUserId = nextUserId;
	resetState();
	if (currentUserId) {
		startStream();
	}
});

$effect(() => {
	const response = $notificationsQuery.data;
	if (!response) {
		return;
	}

	const nextNotifications = sortNotificationsByDeliveredAtDesc(response.items);
	const nextCursorMs = deriveCursorMs(nextNotifications);

	notifications = nextNotifications;
	unreadCount = response.unread;
	cursorMs = nextCursorMs;
	loadError = null;
});

$effect(() => {
	if ($notificationsQuery.isError) {
		setLoadError($notificationsQuery.error, "Failed to load notifications");
	}
});

onMount(() => {
	document.addEventListener("pointerdown", handleDocumentPointerDown);
	return () => {
		document.removeEventListener("pointerdown", handleDocumentPointerDown);
		closeStream();
	};
});
</script>

{#if $sessionQuery.data?.user}
	<div class="relative" bind:this={containerEl}>
		<Button
			variant="outline"
			size="sm"
			class="relative"
			aria-haspopup="dialog"
			aria-expanded={isOpen}
			onclick={togglePanel}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				class="h-4 w-4"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path
					d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"
				/>
				<path d="M10 20a2 2 0 0 0 4 0" />
			</svg>
			<span class="sr-only">Notifications</span>
			{#if unreadCount > 0}
				<span
					class="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold leading-5 text-destructive-foreground"
				>
					{unreadCount > 99 ? "99+" : unreadCount}
				</span>
			{/if}
		</Button>

		{#if isOpen}
			<div
				class="absolute right-0 top-full z-40 mt-2 w-[340px] rounded-lg border border-border bg-background shadow-lg"
			>
				<div
					class="flex items-center justify-between border-b border-border px-4 py-3"
				>
					<div>
						<p class="text-sm font-semibold">Notifications</p>
						<p class="text-xs text-muted-foreground">
							{streamStateLabel(streamState)}
						</p>
					</div>
					{#if unreadCount > 0}
						<Button variant="ghost" size="sm" onclick={handleMarkAllClick}>
							Mark all viewed
						</Button>
					{/if}
				</div>

				{#if isLoading}
					<p class="px-4 py-6 text-sm text-muted-foreground">Loading...</p>
				{:else if loadError}
					<p class="px-4 py-6 text-sm text-destructive">{loadError}</p>
				{:else if notifications.length === 0}
					<p class="px-4 py-6 text-sm text-muted-foreground">
						No notifications yet.
					</p>
				{:else}
					<ul class="max-h-[420px] overflow-y-auto">
						{#each notifications.slice(0, MAX_ITEMS) as item (item.id)}
							<li class="border-b border-border/60 last:border-b-0">
								<a
									href={item.ctaUrl ?? resolve("/dashboard")}
									class="block px-4 py-3 transition hover:bg-muted/40"
									onclick={() => handleNotificationClick(item.id)}
								>
									<div class="mb-1 flex items-start gap-2">
										<span
											class={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${notificationSeverityClass(item.severity)}`}
										></span>
										<p class="line-clamp-2 text-sm font-medium">{item.title}</p>
										{#if !item.viewedAt}
											<span
												class="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary"
											>
												New
											</span>
										{/if}
									</div>
									{#if item.body}
										<p class="line-clamp-2 text-xs text-muted-foreground">
											{item.body}
										</p>
									{/if}
									<p class="pt-1 text-[11px] text-muted-foreground">
										{formatNotificationDateTime(item.deliveredAt)}
									</p>
								</a>
							</li>
						{/each}
					</ul>
				{/if}

				<div class="border-t border-border px-4 py-2">
					<a
						href={resolve("/dashboard")}
						class="text-xs font-medium text-muted-foreground transition hover:text-foreground"
						onclick={closePanel}
					>
						Open dashboard
					</a>
				</div>
			</div>
		{/if}
	</div>
{/if}
