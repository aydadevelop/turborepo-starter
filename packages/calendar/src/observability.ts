import {
	calendarIngressEvent,
	calendarWebhookEvent,
	listingCalendarConnection,
} from "@my-app/db/schema/availability";
import { listing } from "@my-app/db/schema/marketplace";
import { count, desc, eq } from "drizzle-orm";
import type {
	CalendarWebhookNotification,
	CalendarConnectionRow,
	Db,
} from "./types";

export type CalendarIngressEventStatus =
	| "received"
	| "accepted"
	| "duplicate"
	| "unmatched"
	| "missing_headers"
	| "unauthorized"
	| "adapter_not_configured"
	| "failed";

export type CalendarWebhookEventStatus =
	| "processed"
	| "skipped"
	| "failed";

export interface CalendarIngressRequestContext {
	headers?: Record<string, string>;
	host?: string | null;
	method: string;
	path: string;
	payload?: Record<string, unknown> | null;
	remoteIp?: string | null;
	requestId?: string | null;
	traceId?: string | null;
	userAgent?: string | null;
}

export const createCalendarIngressEvent = async (
	db: Db,
	params: {
		provider: CalendarConnectionRow["provider"];
		request: CalendarIngressRequestContext;
	},
) => {
	const [row] = await db
		.insert(calendarIngressEvent)
		.values({
			id: crypto.randomUUID(),
			provider: params.provider,
			routePath: params.request.path,
			method: params.request.method,
			host: params.request.host ?? null,
			requestId: params.request.requestId ?? null,
			traceId: params.request.traceId ?? null,
			remoteIp: params.request.remoteIp ?? null,
			userAgent: params.request.userAgent ?? null,
			headers: params.request.headers ?? null,
			payload: params.request.payload ?? null,
			status: "received",
		})
		.returning();

	if (!row) {
		throw new Error("Failed to insert calendar ingress event");
	}

	return row;
};

export const finalizeCalendarIngressEvent = async (
	db: Db,
	params: {
		calendarConnectionId?: string | null;
		calendarWebhookEventId?: string | null;
		errorMessage?: string | null;
		ingressEventId: string;
		notification?: CalendarWebhookNotification | null;
		organizationId?: string | null;
		responseCode?: number | null;
		status: CalendarIngressEventStatus;
	},
) => {
	const [row] = await db
		.update(calendarIngressEvent)
		.set({
			organizationId: params.organizationId ?? null,
			calendarConnectionId: params.calendarConnectionId ?? null,
			calendarWebhookEventId: params.calendarWebhookEventId ?? null,
			providerChannelId: params.notification?.channelId ?? null,
			providerResourceId: params.notification?.resourceId ?? null,
			messageNumber: params.notification?.messageNumber ?? null,
			resourceState: params.notification?.resourceState ?? null,
			status: params.status,
			responseCode: params.responseCode ?? null,
			errorMessage: params.errorMessage ?? null,
			processedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(calendarIngressEvent.id, params.ingressEventId))
		.returning();

	if (!row) {
		throw new Error("Calendar ingress event not found");
	}

	return row;
};

const emptyIngressStatusCounts = () => ({
	received: 0,
	accepted: 0,
	duplicate: 0,
	unmatched: 0,
	missing_headers: 0,
	unauthorized: 0,
	adapter_not_configured: 0,
	failed: 0,
});

const emptyWebhookStatusCounts = () => ({
	processed: 0,
	skipped: 0,
	failed: 0,
});

export const getOrganizationCalendarObservability = async (
	params: {
		limit?: number;
		organizationId: string;
	},
	db: Db,
) => {
	const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

	const [connections, ingressEvents, webhookEvents, ingressStatusRows, webhookStatusRows] =
		await Promise.all([
			db
				.select({
					id: listingCalendarConnection.id,
					listingId: listingCalendarConnection.listingId,
					listingName: listing.name,
					provider: listingCalendarConnection.provider,
					externalCalendarId: listingCalendarConnection.externalCalendarId,
					isActive: listingCalendarConnection.isActive,
					isPrimary: listingCalendarConnection.isPrimary,
					syncStatus: listingCalendarConnection.syncStatus,
					syncRetryCount: listingCalendarConnection.syncRetryCount,
					lastSyncedAt: listingCalendarConnection.lastSyncedAt,
					lastError: listingCalendarConnection.lastError,
					watchChannelId: listingCalendarConnection.watchChannelId,
					watchResourceId: listingCalendarConnection.watchResourceId,
					watchExpiration: listingCalendarConnection.watchExpiration,
					createdAt: listingCalendarConnection.createdAt,
					updatedAt: listingCalendarConnection.updatedAt,
				})
				.from(listingCalendarConnection)
				.leftJoin(listing, eq(listing.id, listingCalendarConnection.listingId))
				.where(eq(listingCalendarConnection.organizationId, params.organizationId))
				.orderBy(desc(listingCalendarConnection.updatedAt)),
			db
				.select({
					id: calendarIngressEvent.id,
					organizationId: calendarIngressEvent.organizationId,
					calendarConnectionId: calendarIngressEvent.calendarConnectionId,
					provider: calendarIngressEvent.provider,
					listingId: listingCalendarConnection.listingId,
					listingName: listing.name,
					routePath: calendarIngressEvent.routePath,
					method: calendarIngressEvent.method,
					host: calendarIngressEvent.host,
					requestId: calendarIngressEvent.requestId,
					traceId: calendarIngressEvent.traceId,
					remoteIp: calendarIngressEvent.remoteIp,
					userAgent: calendarIngressEvent.userAgent,
					providerChannelId: calendarIngressEvent.providerChannelId,
					providerResourceId: calendarIngressEvent.providerResourceId,
					messageNumber: calendarIngressEvent.messageNumber,
					resourceState: calendarIngressEvent.resourceState,
					status: calendarIngressEvent.status,
					responseCode: calendarIngressEvent.responseCode,
					errorMessage: calendarIngressEvent.errorMessage,
					calendarWebhookEventId: calendarIngressEvent.calendarWebhookEventId,
					receivedAt: calendarIngressEvent.receivedAt,
					processedAt: calendarIngressEvent.processedAt,
					createdAt: calendarIngressEvent.createdAt,
					updatedAt: calendarIngressEvent.updatedAt,
				})
				.from(calendarIngressEvent)
				.leftJoin(
					listingCalendarConnection,
					eq(listingCalendarConnection.id, calendarIngressEvent.calendarConnectionId),
				)
				.leftJoin(listing, eq(listing.id, listingCalendarConnection.listingId))
				.where(eq(calendarIngressEvent.organizationId, params.organizationId))
				.orderBy(desc(calendarIngressEvent.receivedAt))
				.limit(limit),
			db
				.select({
					id: calendarWebhookEvent.id,
					calendarConnectionId: calendarWebhookEvent.calendarConnectionId,
					provider: calendarWebhookEvent.provider,
					listingId: listingCalendarConnection.listingId,
					listingName: listing.name,
					providerChannelId: calendarWebhookEvent.providerChannelId,
					providerResourceId: calendarWebhookEvent.providerResourceId,
					messageNumber: calendarWebhookEvent.messageNumber,
					resourceState: calendarWebhookEvent.resourceState,
					status: calendarWebhookEvent.status,
					errorMessage: calendarWebhookEvent.errorMessage,
					receivedAt: calendarWebhookEvent.receivedAt,
					processedAt: calendarWebhookEvent.processedAt,
					createdAt: calendarWebhookEvent.createdAt,
					updatedAt: calendarWebhookEvent.updatedAt,
				})
				.from(calendarWebhookEvent)
				.innerJoin(
					listingCalendarConnection,
					eq(listingCalendarConnection.id, calendarWebhookEvent.calendarConnectionId),
				)
				.leftJoin(listing, eq(listing.id, listingCalendarConnection.listingId))
				.where(eq(listingCalendarConnection.organizationId, params.organizationId))
				.orderBy(desc(calendarWebhookEvent.receivedAt))
				.limit(limit),
			db
				.select({
					status: calendarIngressEvent.status,
					value: count(),
				})
				.from(calendarIngressEvent)
				.where(eq(calendarIngressEvent.organizationId, params.organizationId))
				.groupBy(calendarIngressEvent.status),
			db
				.select({
					status: calendarWebhookEvent.status,
					value: count(),
				})
				.from(calendarWebhookEvent)
				.innerJoin(
					listingCalendarConnection,
					eq(listingCalendarConnection.id, calendarWebhookEvent.calendarConnectionId),
				)
				.where(eq(listingCalendarConnection.organizationId, params.organizationId))
				.groupBy(calendarWebhookEvent.status),
		]);

	const ingressStatusCounts = emptyIngressStatusCounts();
	for (const row of ingressStatusRows) {
		ingressStatusCounts[row.status as CalendarIngressEventStatus] = row.value;
	}

	const webhookStatusCounts = emptyWebhookStatusCounts();
	for (const row of webhookStatusRows) {
		webhookStatusCounts[row.status as CalendarWebhookEventStatus] = row.value;
	}

	return {
		connections,
		ingressEvents,
		ingressStatusCounts,
		webhookEvents,
		webhookStatusCounts,
	};
};
