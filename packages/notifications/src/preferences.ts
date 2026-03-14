import { db } from "@my-app/db";
import {
	type NotificationChannel,
	notificationPreference,
} from "@my-app/db/schema/notification";
import { and, asc, eq, inArray } from "drizzle-orm";

const DEFAULT_CHANNEL_ENABLEMENT: Record<NotificationChannel, boolean> = {
	in_app: true,
	telegram: false,
	vk: false,
	max: false,
	social: false,
	email: false,
	sms: false,
};

const normalizeOrganizationId = (organizationId: string | null | undefined) => {
	const normalized = organizationId?.trim();
	return normalized && normalized.length > 0 ? normalized : null;
};

type NotificationPreferenceRow = typeof notificationPreference.$inferSelect;

export class PreferenceController {
	async resolveChannelEnabled(params: {
		userId: string;
		organizationId: string;
		eventType: string;
		channel: NotificationChannel;
	}) {
		const preferences = await db
			.select()
			.from(notificationPreference)
			.where(
				and(
					eq(notificationPreference.userId, params.userId),
					eq(notificationPreference.channel, params.channel),
					inArray(notificationPreference.eventType, [params.eventType, "*"]),
					inArray(notificationPreference.organizationScopeKey, [
						"global",
						params.organizationId,
					]),
				),
			);

		const rankPreference = (row: (typeof preferences)[number]) => {
			const isOrgSpecific = row.organizationScopeKey === params.organizationId;
			const isEventSpecific = row.eventType === params.eventType;
			if (isOrgSpecific && isEventSpecific) {
				return 4;
			}
			if (isOrgSpecific && row.eventType === "*") {
				return 3;
			}
			if (row.organizationScopeKey === "global" && isEventSpecific) {
				return 2;
			}
			return 1;
		};

		const topPreference = preferences.sort(
			(a, b) => rankPreference(b) - rankPreference(a),
		)[0];
		if (topPreference) {
			return topPreference.enabled;
		}

		return DEFAULT_CHANNEL_ENABLEMENT[params.channel];
	}

	listUserPreferences(params: {
		userId: string;
		organizationId?: string | null;
	}): Promise<NotificationPreferenceRow[]> {
		const organizationId = normalizeOrganizationId(params.organizationId);
		if (organizationId) {
			return db
				.select()
				.from(notificationPreference)
				.where(
					and(
						eq(notificationPreference.userId, params.userId),
						inArray(notificationPreference.organizationScopeKey, [
							"global",
							organizationId,
						]),
					),
				)
				.orderBy(
					asc(notificationPreference.organizationScopeKey),
					asc(notificationPreference.eventType),
					asc(notificationPreference.channel),
				);
		}

		return db
			.select()
			.from(notificationPreference)
			.where(eq(notificationPreference.userId, params.userId))
			.orderBy(
				asc(notificationPreference.organizationScopeKey),
				asc(notificationPreference.eventType),
				asc(notificationPreference.channel),
			);
	}

	async upsertUserPreference(params: {
		userId: string;
		actorUserId?: string;
		organizationId?: string | null;
		eventType: string;
		channel: NotificationChannel;
		enabled: boolean;
		quietHoursStart?: number | null;
		quietHoursEnd?: number | null;
		timezone?: string | null;
	}): Promise<NotificationPreferenceRow> {
		const organizationId = normalizeOrganizationId(params.organizationId);
		const organizationScopeKey = organizationId ?? "global";
		const eventType = params.eventType.trim();
		const updatedAt = new Date();

		await db
			.insert(notificationPreference)
			.values({
				id: crypto.randomUUID(),
				userId: params.userId,
				organizationId,
				organizationScopeKey,
				eventType,
				channel: params.channel,
				enabled: params.enabled,
				quietHoursStart: params.quietHoursStart ?? null,
				quietHoursEnd: params.quietHoursEnd ?? null,
				timezone: params.timezone?.trim() ? params.timezone.trim() : null,
				createdByUserId: params.actorUserId ?? params.userId,
				createdAt: updatedAt,
				updatedAt,
			})
			.onConflictDoUpdate({
				target: [
					notificationPreference.userId,
					notificationPreference.organizationScopeKey,
					notificationPreference.eventType,
					notificationPreference.channel,
				],
				set: {
					organizationId,
					enabled: params.enabled,
					quietHoursStart: params.quietHoursStart ?? null,
					quietHoursEnd: params.quietHoursEnd ?? null,
					timezone: params.timezone?.trim() ? params.timezone.trim() : null,
					createdByUserId: params.actorUserId ?? params.userId,
					updatedAt,
				},
			});

		const [preference] = await db
			.select()
			.from(notificationPreference)
			.where(
				and(
					eq(notificationPreference.userId, params.userId),
					eq(notificationPreference.organizationScopeKey, organizationScopeKey),
					eq(notificationPreference.eventType, eventType),
					eq(notificationPreference.channel, params.channel),
				),
			)
			.limit(1);

		if (!preference) {
			throw new Error("Failed to persist notification preference");
		}

		return preference;
	}
}
