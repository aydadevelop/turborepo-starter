import type {
	BusySlot,
	CalendarAccountConfig,
	CalendarAdapter,
	CalendarConnectionConfig,
	CalendarEventInput,
	CalendarEventsQuery,
	CalendarEventsResult,
	CalendarEventPresentation,
	CalendarWebhookNotification,
	CalendarWatchChannel,
	CalendarWatchStartInput,
	CalendarWatchStopInput,
	CalendarSourcePresentation,
} from "./types";

interface FakeEventRecord {
	calendarId: string;
	eventId: string;
	iCalUid: string;
	input: CalendarEventInput;
	status: "confirmed" | "tentative" | "cancelled" | "unknown";
	syncedAt: Date;
	version: number;
}

/**
 * In-memory CalendarAdapter implementation for use in tests and local dev.
 * No network calls — all state is held in a Map for the lifetime of the instance.
 */
export class FakeCalendarAdapter implements CalendarAdapter {
	private readonly events = new Map<string, FakeEventRecord>();
	private readonly watchChannels = new Map<
		string,
		{ expirationAt?: Date; resourceId: string }
	>();

	private key(calendarId: string, eventId: string) {
		return `${calendarId}:${eventId}`;
	}

	createEvent(
		input: CalendarEventInput,
		config: CalendarConnectionConfig,
	): Promise<CalendarEventPresentation> {
		const eventId = crypto.randomUUID();
		const iCalUid = `${eventId}@fake-calendar`;
		const record: FakeEventRecord = {
			eventId,
			calendarId: config.calendarId,
			input: { ...input },
			iCalUid,
			status: "confirmed",
			version: 1,
			syncedAt: new Date(),
		};
		this.events.set(this.key(config.calendarId, eventId), record);
		return Promise.resolve({
			eventId,
			calendarId: config.calendarId,
			syncedAt: record.syncedAt,
			iCalUid,
			version: String(record.version),
		});
	}

	updateEvent(
		eventId: string,
		input: Partial<CalendarEventInput>,
		config: CalendarConnectionConfig,
	): Promise<CalendarEventPresentation> {
		const k = this.key(config.calendarId, eventId);
		const existing = this.events.get(k);
		if (!existing) {
			throw new Error(
				`FAKE_CALENDAR_UPDATE_FAILED: Event ${eventId} not found`,
			);
		}
		const updated: FakeEventRecord = {
			...existing,
			input: { ...existing.input, ...input },
			status: existing.status,
			version: existing.version + 1,
			syncedAt: new Date(),
		};
		this.events.set(k, updated);
		return Promise.resolve({
			eventId,
			calendarId: config.calendarId,
			syncedAt: updated.syncedAt,
			iCalUid: `${eventId}@fake-calendar`,
			version: String(updated.version),
		});
	}

	deleteEvent(
		eventId: string,
		config: CalendarConnectionConfig,
	): Promise<void> {
		this.events.delete(this.key(config.calendarId, eventId));
		return Promise.resolve();
	}

	listCalendars(
		config: CalendarAccountConfig,
	): Promise<CalendarSourcePresentation[]> {
		const configuredSources = config.credentials.sources;
		if (Array.isArray(configuredSources)) {
			return Promise.resolve(
				configuredSources.map((source, index) => ({
					externalCalendarId: String(
						(source as { externalCalendarId?: unknown }).externalCalendarId ??
							`fake-calendar-${index + 1}`,
					),
					name: String(
						(source as { name?: unknown }).name ?? `Fake calendar ${index + 1}`,
					),
					timezone:
						(source as { timezone?: unknown }).timezone == null
							? null
							: String((source as { timezone: unknown }).timezone),
					isPrimary: Boolean(
						(source as { isPrimary?: unknown }).isPrimary ?? index === 0,
					),
					isHidden: Boolean(
						(source as { isHidden?: unknown }).isHidden ?? false,
					),
					metadata:
						(source as { metadata?: unknown }).metadata &&
						typeof (source as { metadata?: unknown }).metadata === "object"
							? (source as { metadata: Record<string, unknown> }).metadata
							: null,
				})),
			);
		}

		return Promise.resolve([
			{
				externalCalendarId: "primary-fake-calendar",
				name: "Primary fake calendar",
				timezone: "UTC",
				isPrimary: true,
				isHidden: false,
				metadata: null,
			},
			{
				externalCalendarId: "backup-fake-calendar",
				name: "Backup fake calendar",
				timezone: "UTC",
				isPrimary: false,
				isHidden: false,
				metadata: null,
			},
		]);
	}

	listBusySlots(
		calendarId: string,
		from: Date,
		to: Date,
		_config: CalendarConnectionConfig,
	): Promise<BusySlot[]> {
		const slots: BusySlot[] = [];
		for (const record of this.events.values()) {
			if (
				record.calendarId === calendarId &&
				record.input.startsAt < to &&
				record.input.endsAt > from
			) {
				slots.push({
					startsAt: record.input.startsAt,
					endsAt: record.input.endsAt,
					externalEventId: record.eventId,
				});
			}
		}
		return Promise.resolve(slots);
	}

	listEvents(
		query: CalendarEventsQuery,
		_config: CalendarConnectionConfig,
	): Promise<CalendarEventsResult> {
		const events = Array.from(this.events.values())
			.filter((record) => record.calendarId === query.calendarId)
			.filter((record) => {
				if (query.timeMin && record.input.endsAt <= query.timeMin) {
					return false;
				}
				if (query.timeMax && record.input.startsAt >= query.timeMax) {
					return false;
				}
				return true;
			})
			.map((record) => ({
				description: record.input.description,
				endsAt: record.input.endsAt,
				externalEventId: record.eventId,
				iCalUid: record.iCalUid,
				startsAt: record.input.startsAt,
				status: record.status,
				timezone: record.input.timezone,
				title: record.input.title,
				updatedAt: record.syncedAt,
				version: String(record.version),
			}));

		return Promise.resolve({
			events,
			nextSyncToken: `fake-sync-${this.events.size}`,
		});
	}

	startWatch(
		input: CalendarWatchStartInput,
		config: CalendarConnectionConfig,
	): Promise<CalendarWatchChannel> {
		const channelId = input.channelId ?? crypto.randomUUID();
		const resourceId = `${config.calendarId}:${channelId}`;
		const expirationAt = input.ttlSeconds
			? new Date(Date.now() + input.ttlSeconds * 1000)
			: undefined;
		this.watchChannels.set(channelId, { expirationAt, resourceId });
		return Promise.resolve({
			channelId,
			resourceId,
			expirationAt,
			resourceUri: `${input.webhookUrl}/${config.calendarId}`,
		});
	}

	stopWatch(
		input: CalendarWatchStopInput,
		_config: CalendarConnectionConfig,
	): Promise<void> {
		const existing = this.watchChannels.get(input.channelId);
		if (existing?.resourceId === input.resourceId) {
			this.watchChannels.delete(input.channelId);
		}
		return Promise.resolve();
	}

	parseWebhookNotification(
		headers: Headers | Record<string, string | undefined>,
	): CalendarWebhookNotification | null {
		const getHeader = (name: string) => {
			if (headers instanceof Headers) {
				return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
			}
			const lowerName = name.toLowerCase();
			for (const [headerName, headerValue] of Object.entries(headers)) {
				if (headerName.toLowerCase() === lowerName) {
					return headerValue;
				}
			}
			return undefined;
		};

		const channelId = getHeader("x-goog-channel-id");
		const resourceId = getHeader("x-goog-resource-id");
		const resourceState = getHeader("x-goog-resource-state");
		if (!(channelId && resourceId && resourceState)) {
			return null;
		}

		const messageNumberRaw = getHeader("x-goog-message-number");
		const parsedMessageNumber = messageNumberRaw
			? Number.parseInt(messageNumberRaw, 10)
			: undefined;
		const channelExpirationRaw = getHeader("x-goog-channel-expiration");

		return {
			channelId,
			resourceId,
			resourceState,
			channelToken: getHeader("x-goog-channel-token"),
			messageNumber:
				parsedMessageNumber !== undefined && !Number.isNaN(parsedMessageNumber)
					? parsedMessageNumber
					: undefined,
			resourceUri: getHeader("x-goog-resource-uri"),
			channelExpiration: channelExpirationRaw
				? new Date(channelExpirationRaw)
				: undefined,
		};
	}

	/** Test helper — get all events in the calendar. */
	getAllEvents(calendarId: string): FakeEventRecord[] {
		return Array.from(this.events.values()).filter(
			(r) => r.calendarId === calendarId,
		);
	}

	/** Test helper — clear all events. */
	clear(): void {
		this.events.clear();
	}
}
