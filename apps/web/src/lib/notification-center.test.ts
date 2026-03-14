import { describe, expect, it } from "vitest";
import {
	markNotificationListViewedLocally,
	mergeNotificationList,
} from "./notification-center";

describe("notification-center cache helpers", () => {
	it("merges incoming items and recomputes unread count", () => {
		const current = {
			items: [
				{
					id: "n1",
					title: "Existing",
					body: null,
					ctaUrl: null,
					severity: "info" as const,
					deliveredAt: "2026-03-10T10:00:00.000Z",
					viewedAt: null,
				},
			],
			unread: 1,
		};

		const next = mergeNotificationList(current, [
			{
				id: "n2",
				title: "New",
				body: null,
				ctaUrl: null,
				severity: "success" as const,
				deliveredAt: "2026-03-10T11:00:00.000Z",
				viewedAt: null,
			},
		]);

		expect(next.items.map((item) => item.id)).toEqual(["n2", "n1"]);
		expect(next.unread).toBe(2);
	});

	it("marks selected notifications viewed and updates unread count", () => {
		const current = {
			items: [
				{
					id: "n1",
					title: "Existing",
					body: null,
					ctaUrl: null,
					severity: "info" as const,
					deliveredAt: "2026-03-10T10:00:00.000Z",
					viewedAt: null,
				},
				{
					id: "n2",
					title: "Viewed",
					body: null,
					ctaUrl: null,
					severity: "warning" as const,
					deliveredAt: "2026-03-10T09:00:00.000Z",
					viewedAt: "2026-03-10T09:30:00.000Z",
				},
			],
			unread: 1,
		};

		const next = markNotificationListViewedLocally(
			current,
			["n1"],
			"2026-03-10T12:00:00.000Z",
		);

		expect(next?.items[0]?.viewedAt).toBe("2026-03-10T12:00:00.000Z");
		expect(next?.unread).toBe(0);
	});
});
