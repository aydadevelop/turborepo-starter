import type {
	CalendarAdapter,
	CalendarAdapterProvider,
	CalendarBusyInterval,
	CalendarBusyQuery,
	CalendarEventInput,
	CalendarEventResult,
	CalendarEventSnapshot,
	CalendarEventsQuery,
	CalendarEventsResult,
	CalendarWatchChannel,
	CalendarWatchStartInput,
	CalendarWatchStopInput,
	CalendarWebhookNotification,
} from "./types";

const DEFAULT_EVENTS_SCOPE =
	"https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events";
const DEFAULT_FREEBUSY_SCOPE =
	"https://www.googleapis.com/auth/calendar.freebusy";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

interface GoogleServiceAccountCredentials {
	client_email: string;
	private_key: string;
	token_uri?: string;
	private_key_id?: string;
}

interface GoogleCalendarAdapterOptions {
	credentials: GoogleServiceAccountCredentials;
	eventsScope?: string;
	freeBusyScope?: string;
	fetchImpl?: typeof fetch;
	requestTimeoutMs?: number;
}

interface GoogleTokenResponse {
	access_token: string;
	expires_in: number;
	token_type: string;
}

interface GoogleCalendarEvent {
	id: string;
	status?: string;
	summary?: string;
	description?: string;
	start?: GoogleCalendarDateTime;
	end?: GoogleCalendarDateTime;
	iCalUID?: string;
	etag?: string;
	updated?: string;
}

interface GoogleCalendarDateTime {
	date?: string;
	dateTime?: string;
	timeZone?: string;
}

interface GoogleCalendarEventsResponse {
	items?: GoogleCalendarEvent[];
	nextPageToken?: string;
	nextSyncToken?: string;
}

interface GoogleCalendarWatchResponse {
	id: string;
	resourceId: string;
	resourceUri?: string;
	expiration?: string;
}

interface GoogleFreeBusyResponse {
	calendars?: Record<
		string,
		{
			busy?: Array<{ start: string; end: string }>;
			errors?: Array<{ reason?: string; message?: string }>;
		}
	>;
}

export class GoogleCalendarApiError extends Error {
	readonly status: number;
	readonly statusText: string;
	readonly responseBody: string;
	readonly url: string;

	constructor(params: {
		message: string;
		status: number;
		statusText: string;
		responseBody: string;
		url: string;
	}) {
		super(params.message);
		this.name = "GoogleCalendarApiError";
		this.status = params.status;
		this.statusText = params.statusText;
		this.responseBody = params.responseBody;
		this.url = params.url;
	}
}

export class GoogleCalendarAdapter implements CalendarAdapter {
	readonly provider: CalendarAdapterProvider = "google";

	private readonly credentials: GoogleServiceAccountCredentials;
	private readonly eventsScope: string;
	private readonly freeBusyScope: string;
	private readonly fetchImpl: typeof fetch;
	private readonly requestTimeoutMs: number;
	private readonly accessTokenCache = new Map<
		string,
		{ accessToken: string; expiresAt: number }
	>();

	constructor(options: GoogleCalendarAdapterOptions) {
		this.credentials = options.credentials;
		this.eventsScope = options.eventsScope ?? DEFAULT_EVENTS_SCOPE;
		this.freeBusyScope = options.freeBusyScope ?? DEFAULT_FREEBUSY_SCOPE;
		this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
		this.requestTimeoutMs = options.requestTimeoutMs ?? 20_000;

		if (!(this.credentials.client_email && this.credentials.private_key)) {
			throw new Error(
				"Google calendar credentials are invalid: client_email and private_key are required"
			);
		}
	}

	async upsertEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
		if (input.startsAt >= input.endsAt) {
			throw new Error("Calendar event startsAt must be before endsAt");
		}

		const payload = {
			id: input.externalEventId,
			summary: input.title,
			description: input.description,
			start: {
				dateTime: input.startsAt.toISOString(),
				timeZone: input.timezone,
			},
			end: {
				dateTime: input.endsAt.toISOString(),
				timeZone: input.timezone,
			},
			extendedProperties: input.metadata
				? {
						private: input.metadata,
					}
				: undefined,
		};

		const encodedCalendarId = encodeURIComponent(input.externalCalendarId);
		const eventsBaseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`;

		const event = input.externalEventId
			? await this.patchOrCreateEvent(
					eventsBaseUrl,
					input.externalEventId,
					payload
				)
			: await this.createEvent(eventsBaseUrl, payload);

		return {
			externalCalendarId: input.externalCalendarId,
			externalEventId: event.id,
			iCalUid: event.iCalUID,
			version: this.normalizeGoogleEventVersion(event),
			syncedAt: this.parseGoogleUpdatedAt(event.updated),
		};
	}

	async deleteEvent(params: {
		externalCalendarId: string;
		externalEventId: string;
	}): Promise<void> {
		const encodedCalendarId = encodeURIComponent(params.externalCalendarId);
		const encodedEventId = encodeURIComponent(params.externalEventId);
		const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events/${encodedEventId}`;

		try {
			await this.requestGoogle({
				scope: this.eventsScope,
				url,
				method: "DELETE",
			});
		} catch (error) {
			if (error instanceof GoogleCalendarApiError && error.status === 404) {
				return;
			}
			throw error;
		}
	}

	async listBusyIntervals(
		query: CalendarBusyQuery
	): Promise<CalendarBusyInterval[]> {
		const response = await this.requestGoogle<GoogleFreeBusyResponse>({
			scope: this.freeBusyScope,
			url: "https://www.googleapis.com/calendar/v3/freeBusy",
			method: "POST",
			body: JSON.stringify({
				timeMin: query.from.toISOString(),
				timeMax: query.to.toISOString(),
				items: [{ id: query.externalCalendarId }],
			}),
		});

		const calendar = response.calendars?.[query.externalCalendarId];
		if (!calendar) {
			throw new Error(
				`Google freebusy did not include calendar '${query.externalCalendarId}'`
			);
		}
		if (calendar.errors && calendar.errors.length > 0) {
			const reasons = calendar.errors
				.map((error) => error.reason ?? error.message ?? "unknown")
				.join(", ");
			throw new Error(
				`Google freebusy reported errors for calendar '${query.externalCalendarId}': ${reasons}`
			);
		}

		return (calendar.busy ?? []).map((busyRange) => ({
			startsAt: new Date(busyRange.start),
			endsAt: new Date(busyRange.end),
		}));
	}

	async listEvents(query: CalendarEventsQuery): Promise<CalendarEventsResult> {
		const encodedCalendarId = encodeURIComponent(query.externalCalendarId);
		const searchParams = new URLSearchParams();
		if (query.syncToken) {
			searchParams.set("syncToken", query.syncToken);
		} else {
			if (query.timeMin) {
				searchParams.set("timeMin", query.timeMin.toISOString());
			}
			if (query.timeMax) {
				searchParams.set("timeMax", query.timeMax.toISOString());
			}
		}
		if (query.pageToken) {
			searchParams.set("pageToken", query.pageToken);
		}
		searchParams.set("showDeleted", String(query.showDeleted ?? true));
		searchParams.set("singleEvents", String(query.singleEvents ?? true));
		if (query.maxResults) {
			searchParams.set("maxResults", String(query.maxResults));
		}
		const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events?${searchParams.toString()}`;

		const response = await this.requestGoogle<GoogleCalendarEventsResponse>({
			scope: this.eventsScope,
			url,
			method: "GET",
		});

		return {
			events: (response.items ?? []).map((event) =>
				this.mapGoogleEventToSnapshot(event)
			),
			nextPageToken: response.nextPageToken,
			nextSyncToken: response.nextSyncToken,
		};
	}

	async startWatch(
		input: CalendarWatchStartInput
	): Promise<CalendarWatchChannel> {
		const encodedCalendarId = encodeURIComponent(input.externalCalendarId);
		const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events/watch`;
		const payload: Record<string, unknown> = {
			id: input.channelId ?? crypto.randomUUID(),
			type: "web_hook",
			address: input.webhookUrl,
		};
		if (input.channelToken) {
			payload.token = input.channelToken;
		}
		if (input.ttlSeconds) {
			payload.params = {
				ttl: String(input.ttlSeconds),
			};
		}

		const response = await this.requestGoogle<GoogleCalendarWatchResponse>({
			scope: this.eventsScope,
			url,
			method: "POST",
			body: JSON.stringify(payload),
		});

		return {
			channelId: response.id,
			resourceId: response.resourceId,
			resourceUri: response.resourceUri,
			expirationAt: this.parseGoogleExpiration(response.expiration),
		};
	}

	async stopWatch(input: CalendarWatchStopInput): Promise<void> {
		await this.requestGoogle({
			scope: this.eventsScope,
			url: "https://www.googleapis.com/calendar/v3/channels/stop",
			method: "POST",
			body: JSON.stringify({
				id: input.channelId,
				resourceId: input.resourceId,
			}),
		});
	}

	parseWebhookNotification(
		headers: Headers | Record<string, string | undefined>
	): CalendarWebhookNotification | null {
		const channelId = this.getHeader(headers, "x-goog-channel-id");
		const resourceId = this.getHeader(headers, "x-goog-resource-id");
		const resourceState = this.getHeader(headers, "x-goog-resource-state");
		if (!(channelId && resourceId && resourceState)) {
			return null;
		}

		const messageNumberRaw = this.getHeader(headers, "x-goog-message-number");
		const messageNumber = messageNumberRaw
			? Number.parseInt(messageNumberRaw, 10)
			: undefined;
		const channelExpirationRaw = this.getHeader(
			headers,
			"x-goog-channel-expiration"
		);

		return {
			channelId,
			resourceId,
			resourceState,
			messageNumber:
				messageNumber !== undefined && !Number.isNaN(messageNumber)
					? messageNumber
					: undefined,
			resourceUri: this.getHeader(headers, "x-goog-resource-uri"),
			channelToken: this.getHeader(headers, "x-goog-channel-token"),
			channelExpiration: channelExpirationRaw
				? this.parseDateValue(channelExpirationRaw)
				: undefined,
		};
	}

	private async patchOrCreateEvent(
		eventsBaseUrl: string,
		externalEventId: string,
		payload: object
	): Promise<GoogleCalendarEvent> {
		const encodedEventId = encodeURIComponent(externalEventId);
		const patchUrl = `${eventsBaseUrl}/${encodedEventId}`;

		try {
			return await this.requestGoogle<GoogleCalendarEvent>({
				scope: this.eventsScope,
				url: patchUrl,
				method: "PATCH",
				body: JSON.stringify(payload),
			});
		} catch (error) {
			if (!(error instanceof GoogleCalendarApiError) || error.status !== 404) {
				throw error;
			}
			const createPayload = this.omitEventId(payload);
			return await this.createEvent(eventsBaseUrl, createPayload);
		}
	}

	private async createEvent(
		eventsBaseUrl: string,
		payload: object
	): Promise<GoogleCalendarEvent> {
		return await this.requestGoogle<GoogleCalendarEvent>({
			scope: this.eventsScope,
			url: eventsBaseUrl,
			method: "POST",
			body: JSON.stringify(payload),
		});
	}

	private omitEventId(payload: object): object {
		const { id: _ignoredId, ...rest } = payload as Record<string, unknown>;
		return rest;
	}

	private mapGoogleEventToSnapshot(
		event: GoogleCalendarEvent
	): CalendarEventSnapshot {
		const startsAt = this.parseGoogleDateTime(event.start);
		const endsAt = this.parseGoogleDateTime(event.end);
		return {
			externalEventId: event.id,
			status: this.parseGoogleEventStatus(event.status),
			title: event.summary,
			description: event.description,
			startsAt: startsAt?.date,
			endsAt: endsAt?.date,
			timezone: startsAt?.timezone ?? endsAt?.timezone,
			iCalUid: event.iCalUID,
			version: this.normalizeGoogleEventVersion(event),
			updatedAt: this.parseGoogleUpdatedAt(event.updated),
		};
	}

	private parseGoogleEventStatus(
		status: string | undefined
	): CalendarEventSnapshot["status"] {
		if (
			status === "confirmed" ||
			status === "tentative" ||
			status === "cancelled"
		) {
			return status;
		}
		return "unknown";
	}

	private parseGoogleDateTime(value?: GoogleCalendarDateTime) {
		if (!value) {
			return undefined;
		}
		if (value.dateTime) {
			const parsedDateTime = new Date(value.dateTime);
			if (!Number.isNaN(parsedDateTime.getTime())) {
				return {
					date: parsedDateTime,
					timezone: value.timeZone,
				};
			}
		}
		if (value.date) {
			const parsedDate = new Date(`${value.date}T00:00:00.000Z`);
			if (!Number.isNaN(parsedDate.getTime())) {
				return {
					date: parsedDate,
					timezone: value.timeZone,
				};
			}
		}
		return undefined;
	}

	private normalizeGoogleEventVersion(event: GoogleCalendarEvent) {
		if (!event.etag) {
			return undefined;
		}
		return event.etag.replaceAll('"', "");
	}

	private parseGoogleExpiration(value?: string) {
		if (!value) {
			return undefined;
		}
		const asNumber = Number(value);
		if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) {
			return new Date(asNumber);
		}
		return this.parseDateValue(value);
	}

	private parseGoogleUpdatedAt(value?: string) {
		if (!value) {
			return new Date();
		}
		return this.parseDateValue(value) ?? new Date();
	}

	private parseDateValue(value: string) {
		const parsedDate = new Date(value);
		return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
	}

	private getHeader(
		headers: Headers | Record<string, string | undefined>,
		name: string
	) {
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
	}

	private async requestGoogle<T>(params: {
		scope: string;
		url: string;
		method: string;
		body?: string;
	}): Promise<T> {
		const accessToken = await this.getAccessToken(params.scope);

		const headers: Record<string, string> = {
			Authorization: `Bearer ${accessToken}`,
		};
		if (params.body) {
			headers["Content-Type"] = "application/json";
		}

		const response = await this.fetchWithTimeout(params.url, {
			method: params.method,
			headers,
			body: params.body,
		});

		if (!response.ok) {
			const responseBody = await response.text();
			throw new GoogleCalendarApiError({
				message: `Google Calendar request failed (${response.status} ${response.statusText})`,
				status: response.status,
				statusText: response.statusText,
				responseBody,
				url: params.url,
			});
		}

		if (response.status === 204) {
			return undefined as T;
		}

		return (await response.json()) as T;
	}

	private async fetchWithTimeout(
		url: string,
		request: Parameters<typeof fetch>[1]
	): Promise<Response> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => {
			controller.abort();
		}, this.requestTimeoutMs);

		try {
			return await this.fetchImpl(url, {
				...request,
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private async getAccessToken(scope: string): Promise<string> {
		const cachedToken = this.accessTokenCache.get(scope);
		const nowMs = Date.now();
		if (cachedToken && cachedToken.expiresAt - nowMs > 30_000) {
			return cachedToken.accessToken;
		}

		const signedJwt = await this.createSignedJwt(scope);
		const tokenUri = this.credentials.token_uri ?? DEFAULT_TOKEN_URI;
		const body = new URLSearchParams();
		body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
		body.set("assertion", signedJwt);

		const response = await this.fetchWithTimeout(tokenUri, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: body.toString(),
		});

		if (!response.ok) {
			const responseBody = await response.text();
			throw new Error(
				`Failed to fetch Google access token (${response.status} ${response.statusText}): ${responseBody}`
			);
		}

		const tokenPayload = (await response.json()) as GoogleTokenResponse;
		const expiresAt = nowMs + tokenPayload.expires_in * 1000;
		this.accessTokenCache.set(scope, {
			accessToken: tokenPayload.access_token,
			expiresAt,
		});
		return tokenPayload.access_token;
	}

	private async createSignedJwt(scope: string) {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const payload = {
			iss: this.credentials.client_email,
			scope,
			aud: this.credentials.token_uri ?? DEFAULT_TOKEN_URI,
			iat: nowSeconds,
			exp: nowSeconds + 3600,
		};

		const encodedHeader = this.base64UrlEncodeJson({
			alg: "RS256",
			typ: "JWT",
		});
		const encodedPayload = this.base64UrlEncodeJson(payload);
		const unsignedJwt = `${encodedHeader}.${encodedPayload}`;

		const privateKey = await this.importPrivateKey(
			this.credentials.private_key
		);
		const signature = await crypto.subtle.sign(
			"RSASSA-PKCS1-v1_5",
			privateKey,
			this.encodeUtf8(unsignedJwt)
		);
		const encodedSignature = this.base64UrlEncodeBytes(
			new Uint8Array(signature)
		);
		return `${unsignedJwt}.${encodedSignature}`;
	}

	private async importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
		const sanitizedKey = privateKeyPem
			.replace("-----BEGIN PRIVATE KEY-----", "")
			.replace("-----END PRIVATE KEY-----", "")
			.replaceAll("\r", "")
			.replaceAll("\n", "")
			.trim();

		const pkcs8Bytes = this.base64Decode(sanitizedKey);
		return await crypto.subtle.importKey(
			"pkcs8",
			pkcs8Bytes.buffer.slice(
				pkcs8Bytes.byteOffset,
				pkcs8Bytes.byteOffset + pkcs8Bytes.byteLength
			),
			{
				name: "RSASSA-PKCS1-v1_5",
				hash: "SHA-256",
			},
			false,
			["sign"]
		);
	}

	private base64UrlEncodeJson(value: object) {
		return this.base64UrlEncodeBytes(this.encodeUtf8(JSON.stringify(value)));
	}

	private encodeUtf8(value: string) {
		return new TextEncoder().encode(value);
	}

	private base64UrlEncodeBytes(value: Uint8Array) {
		const base64 = this.base64Encode(value);
		return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
	}

	private base64Encode(value: Uint8Array) {
		if (typeof Buffer !== "undefined") {
			return Buffer.from(value).toString("base64");
		}
		let binary = "";
		for (const byte of value) {
			binary += String.fromCharCode(byte);
		}
		return btoa(binary);
	}

	private base64Decode(value: string) {
		if (typeof Buffer !== "undefined") {
			return Uint8Array.from(Buffer.from(value, "base64"));
		}
		const binary = atob(value);
		const result = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			result[index] = binary.charCodeAt(index);
		}
		return result;
	}
}

export const isGoogleServiceAccountCredentials = (
	value: unknown
): value is GoogleServiceAccountCredentials => {
	if (!value || typeof value !== "object") {
		return false;
	}
	const credentials = value as Record<string, unknown>;
	return (
		typeof credentials.client_email === "string" &&
		typeof credentials.private_key === "string"
	);
};
