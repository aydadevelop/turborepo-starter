import type {
	BusySlot,
	CalendarAdapter,
	CalendarConnectionConfig,
	CalendarEventInput,
	CalendarEventPresentation,
} from "./types";

interface FakeEventRecord {
	eventId: string;
	calendarId: string;
	input: CalendarEventInput;
	version: number;
	syncedAt: Date;
}

/**
 * In-memory CalendarAdapter implementation for use in tests and local dev.
 * No network calls — all state is held in a Map for the lifetime of the instance.
 */
export class FakeCalendarAdapter implements CalendarAdapter {
	private readonly events = new Map<string, FakeEventRecord>();

	private key(calendarId: string, eventId: string) {
		return `${calendarId}:${eventId}`;
	}

	createEvent(
		input: CalendarEventInput,
		config: CalendarConnectionConfig,
	): Promise<CalendarEventPresentation> {
		const eventId = crypto.randomUUID();
		const record: FakeEventRecord = {
			eventId,
			calendarId: config.calendarId,
			input: { ...input },
			version: 1,
			syncedAt: new Date(),
		};
		this.events.set(this.key(config.calendarId, eventId), record);
		return Promise.resolve({
			eventId,
			calendarId: config.calendarId,
			syncedAt: record.syncedAt,
			iCalUid: `${eventId}@fake-calendar`,
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
