export const calendarAdapterProviderValues = [
	"google",
	"outlook",
	"ical",
	"manual",
] as const;

export type CalendarAdapterProvider =
	(typeof calendarAdapterProviderValues)[number];

export const calendarEventPresentationValues = [
	"default",
	"prebooking",
	"confirmed",
] as const;
export type CalendarEventPresentation =
	(typeof calendarEventPresentationValues)[number];

export interface CalendarEventInput {
	externalCalendarId: string;
	externalEventId?: string;
	title: string;
	startsAt: Date;
	endsAt: Date;
	timezone: string;
	description?: string;
	presentation?: CalendarEventPresentation;
	metadata?: Record<string, string>;
}

export interface CalendarEventResult {
	externalCalendarId: string;
	externalEventId: string;
	iCalUid?: string;
	version?: string;
	syncedAt: Date;
}

export interface CalendarBusyInterval {
	startsAt: Date;
	endsAt: Date;
	externalEventId?: string;
}

export interface CalendarBusyQuery {
	externalCalendarId: string;
	from: Date;
	to: Date;
}

export interface CalendarEventSnapshot {
	externalEventId: string;
	status: "confirmed" | "tentative" | "cancelled" | "unknown";
	title?: string;
	description?: string;
	startsAt?: Date;
	endsAt?: Date;
	timezone?: string;
	iCalUid?: string;
	version?: string;
	updatedAt?: Date;
}

export interface CalendarEventsQuery {
	externalCalendarId: string;
	syncToken?: string;
	pageToken?: string;
	timeMin?: Date;
	timeMax?: Date;
	showDeleted?: boolean;
	singleEvents?: boolean;
	maxResults?: number;
}

export interface CalendarEventsResult {
	events: CalendarEventSnapshot[];
	nextSyncToken?: string;
	nextPageToken?: string;
}

export interface CalendarWatchStartInput {
	externalCalendarId: string;
	webhookUrl: string;
	channelId?: string;
	channelToken?: string;
	ttlSeconds?: number;
}

export interface CalendarWatchChannel {
	channelId: string;
	resourceId: string;
	resourceUri?: string;
	expirationAt?: Date;
}

export interface CalendarWatchStopInput {
	channelId: string;
	resourceId: string;
}

export interface CalendarWebhookNotification {
	channelId: string;
	resourceId: string;
	resourceState: string;
	messageNumber?: number;
	resourceUri?: string;
	channelToken?: string;
	channelExpiration?: Date;
}

export interface CalendarAdapter {
	readonly provider: CalendarAdapterProvider;
	upsertEvent(input: CalendarEventInput): Promise<CalendarEventResult>;
	deleteEvent(params: {
		externalCalendarId: string;
		externalEventId: string;
	}): Promise<void>;
	listBusyIntervals(query: CalendarBusyQuery): Promise<CalendarBusyInterval[]>;
	listEvents?(query: CalendarEventsQuery): Promise<CalendarEventsResult>;
	startWatch?(input: CalendarWatchStartInput): Promise<CalendarWatchChannel>;
	stopWatch?(input: CalendarWatchStopInput): Promise<void>;
	parseWebhookNotification?(
		headers: Headers | Record<string, string | undefined>
	): CalendarWebhookNotification | null;
}
