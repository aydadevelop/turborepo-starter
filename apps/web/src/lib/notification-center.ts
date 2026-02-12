export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface InAppNotificationItem {
	id: string;
	title: string;
	body: string | null;
	ctaUrl: string | null;
	severity: NotificationSeverity;
	deliveredAt: string;
	viewedAt: string | null;
}

export type NotificationStreamState =
	| "idle"
	| "connecting"
	| "connected"
	| "error";

const MAX_STORED_NOTIFICATIONS = 50;

export const notificationDeliveredAtMs = (item: InAppNotificationItem) => {
	const parsed = new Date(item.deliveredAt).getTime();
	return Number.isFinite(parsed) ? parsed : 0;
};

export const deriveCursorMs = (
	items: InAppNotificationItem[],
	fallback = 0
) => {
	if (items.length === 0) {
		return fallback;
	}

	return Math.max(fallback, ...items.map(notificationDeliveredAtMs));
};

export const countUnreadNotifications = (items: InAppNotificationItem[]) => {
	return items.reduce((accumulator, item) => {
		return accumulator + (item.viewedAt ? 0 : 1);
	}, 0);
};

export const sortNotificationsByDeliveredAtDesc = (
	items: InAppNotificationItem[]
) => {
	return items.slice().sort((left, right) => {
		return notificationDeliveredAtMs(right) - notificationDeliveredAtMs(left);
	});
};

export const mergeNotificationItems = (
	current: InAppNotificationItem[],
	incoming: InAppNotificationItem[]
) => {
	if (incoming.length === 0) {
		return current;
	}

	const merged = new Map<string, InAppNotificationItem>();
	for (const item of current) {
		merged.set(item.id, item);
	}
	for (const item of incoming) {
		merged.set(item.id, item);
	}

	return sortNotificationsByDeliveredAtDesc(Array.from(merged.values())).slice(
		0,
		MAX_STORED_NOTIFICATIONS
	);
};

export const markNotificationsViewedLocally = (
	items: InAppNotificationItem[],
	notificationIds: string[],
	viewedAtIso = new Date().toISOString()
) => {
	if (notificationIds.length === 0) {
		return items;
	}

	const ids = new Set(notificationIds);
	return items.map((item) => {
		if (item.viewedAt || !ids.has(item.id)) {
			return item;
		}
		return {
			...item,
			viewedAt: viewedAtIso,
		};
	});
};

export const formatNotificationDateTime = (value: string) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "Unknown time";
	}

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
};

export const notificationSeverityClass = (
	severity: InAppNotificationItem["severity"]
) => {
	if (severity === "success") {
		return "bg-emerald-500";
	}
	if (severity === "warning") {
		return "bg-amber-500";
	}
	if (severity === "error") {
		return "bg-red-500";
	}
	return "bg-sky-500";
};

export const streamStateLabel = (state: NotificationStreamState) => {
	if (state === "connected") {
		return "Live";
	}
	if (state === "connecting") {
		return "Connecting...";
	}
	if (state === "error") {
		return "Reconnecting...";
	}
	return "Idle";
};
