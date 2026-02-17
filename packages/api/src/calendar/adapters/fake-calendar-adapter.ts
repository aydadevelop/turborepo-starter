import type {
	CalendarAdapter,
	CalendarBusyInterval,
	CalendarBusyQuery,
	CalendarEventInput,
	CalendarEventResult,
} from "./types";

interface FakeCalendarEventRecord {
	externalCalendarId: string;
	externalEventId: string;
	title: string;
	startsAt: Date;
	endsAt: Date;
	timezone: string;
	description?: string;
	presentation?: CalendarEventInput["presentation"];
	metadata?: Record<string, string>;
	iCalUid?: string;
	version?: string;
}

export class FakeCalendarAdapter implements CalendarAdapter {
	readonly provider = "manual" as const;
	private readonly records = new Map<string, FakeCalendarEventRecord>();

	upsertEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
		const externalEventId = input.externalEventId ?? crypto.randomUUID();
		const key = this.getKey(input.externalCalendarId, externalEventId);
		const existing = this.records.get(key);
		const version =
			existing?.version !== undefined
				? String(Number(existing.version) + 1)
				: "1";

		this.records.set(key, {
			externalCalendarId: input.externalCalendarId,
			externalEventId,
			title: input.title,
			startsAt: input.startsAt,
			endsAt: input.endsAt,
			timezone: input.timezone,
			description: input.description,
			presentation: input.presentation,
			metadata: input.metadata,
			iCalUid: existing?.iCalUid ?? `${externalEventId}@fake-calendar`,
			version,
		});

		return Promise.resolve({
			externalCalendarId: input.externalCalendarId,
			externalEventId,
			iCalUid: `${externalEventId}@fake-calendar`,
			version,
			syncedAt: new Date(),
		});
	}

	deleteEvent(params: {
		externalCalendarId: string;
		externalEventId: string;
	}): Promise<void> {
		this.records.delete(
			this.getKey(params.externalCalendarId, params.externalEventId)
		);
		return Promise.resolve();
	}

	listBusyIntervals(query: CalendarBusyQuery): Promise<CalendarBusyInterval[]> {
		const records = Array.from(this.records.values());
		return Promise.resolve(
			records
				.filter(
					(record) =>
						record.externalCalendarId === query.externalCalendarId &&
						record.startsAt < query.to &&
						record.endsAt > query.from
				)
				.map((record) => ({
					startsAt: record.startsAt,
					endsAt: record.endsAt,
					externalEventId: record.externalEventId,
				}))
		);
	}

	private getKey(externalCalendarId: string, externalEventId: string) {
		return `${externalCalendarId}:${externalEventId}`;
	}
}
