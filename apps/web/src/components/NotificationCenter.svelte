<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { consumeEventIterator } from "@orpc/client";
	import {
		createMutation,
		createQuery,
		useQueryClient,
	} from "@tanstack/svelte-query";
	import { onMount } from "svelte";
	import { resolve } from "$app/paths";
	import type { authClient } from "$lib/auth-client";
	import { getAuthenticatedUserId } from "$lib/auth-session";
	import {
		countUnreadNotifications,
		deriveCursorMs,
		formatNotificationDateTime,
		markNotificationListViewedLocally,
		markNotificationsViewedLocally,
		mergeNotificationItems,
		mergeNotificationList,
		type NotificationStreamState,
		notificationSeverityClass,
		streamStateLabel,
	} from "$lib/notification-center";
	import { orpc } from "$lib/orpc";
	import type {
		InAppNotificationItem,
		NotificationListOutput,
	} from "$lib/orpc-types";

	// Session is passed from Header to avoid a second concurrent useSession()
	// subscription — two independent subscriptions cause duplicate session-change
	// renders across Header + NotificationCenter on every auth tick.
	const {
		sessionQuery,
	}: { sessionQuery: ReturnType<typeof authClient.useSession> } = $props();

	const queryClient = useQueryClient();

	const MAX_ITEMS = 20;
	const notificationsQueryInput = { limit: MAX_ITEMS } as const;
	const notificationsQueryKey = orpc.notifications.listMe.queryKey({
		input: notificationsQueryInput,
	});
	const notificationsQuery = createQuery(() =>
		orpc.notifications.listMe.queryOptions({
			input: notificationsQueryInput,
			enabled: Boolean(getAuthenticatedUserId($sessionQuery.data)),
		})
	);
	const markViewedMutation = createMutation(() =>
		orpc.notifications.markViewed.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.notifications.key() });
			},
			onError: (error) => {
				queryClient.invalidateQueries({ queryKey: orpc.notifications.key() });
				setLoadError(error, "Failed to update notification");
			},
		})
	);
	const markAllViewedMutation = createMutation(() =>
		orpc.notifications.markAllViewed.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.notifications.key() });
			},
			onError: (error) => {
				queryClient.invalidateQueries({ queryKey: orpc.notifications.key() });
				setLoadError(error, "Failed to mark notifications as viewed");
			},
		})
	);

	let containerEl = $state<HTMLDivElement | null>(null);
	let isOpen = $state(false);
	let loadError = $state<string | null>(null);
	let streamState = $state<NotificationStreamState>("idle");
	let currentUserId = $state<string | null>(null);
	let cursorMs = $state(0);
	let stopStream: (() => Promise<void>) | null = null;
	const notifications = $derived(notificationsQuery.data?.items ?? []);
	const unreadCount = $derived(notificationsQuery.data?.unread ?? 0);
	const isLoading = $derived(
		notificationsQuery.isPending && notifications.length === 0
	);

	function setLoadError(error: unknown, fallback: string) {
		loadError = error instanceof Error ? error.message : fallback;
	}

	function setNotificationCache(
		updater: (
			current: NotificationListOutput | undefined
		) => NotificationListOutput | undefined
	) {
		queryClient.setQueryData<NotificationListOutput>(
			notificationsQueryKey,
			updater
		);
	}

	function syncCursorFromNotifications(items: InAppNotificationItem[]) {
		cursorMs = deriveCursorMs(items, cursorMs);
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
			orpc.notifications.streamMe.call({
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
						setNotificationCache((current) =>
							mergeNotificationList(current, items)
						);
						syncCursorFromNotifications(items);
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
		setNotificationCache((current) =>
			markNotificationListViewedLocally(current, notificationIds)
		);
	}

	function markAllAsViewed() {
		const unreadIds = notifications
			.filter((item) => !item.viewedAt)
			.map((item) => item.id);
		if (unreadIds.length === 0) {
			return;
		}

		markLocallyViewed(unreadIds);
		markAllViewedMutation.mutate({});
	}

	function markOneAsViewed(notificationId: string) {
		const item = notifications.find((entry) => entry.id === notificationId);
		if (!item || item.viewedAt) {
			return;
		}

		markLocallyViewed([notificationId]);
		markViewedMutation.mutate({
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
			await queryClient.fetchQuery(
				orpc.notifications.listMe.queryOptions({
					input: notificationsQueryInput,
				})
			);
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
		cursorMs = 0;
		queryClient.removeQueries({ queryKey: notificationsQueryKey, exact: true });
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
		const response = notificationsQuery.data;
		if (!response) {
			return;
		}

		syncCursorFromNotifications(response.items);
		loadError = null;
	});

	$effect(() => {
		if (notificationsQuery.isError) {
			setLoadError(notificationsQuery.error, "Failed to load notifications");
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
						href={resolve("/dashboard/settings")}
						class="text-xs font-medium text-muted-foreground transition hover:text-foreground"
						onclick={closePanel}
					>
						Open settings
					</a>
				</div>
			</div>
		{/if}
	</div>
{/if}
