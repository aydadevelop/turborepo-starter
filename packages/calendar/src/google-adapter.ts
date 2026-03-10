import type {
	BusySlot,
	CalendarAdapter,
	CalendarConnectionConfig,
	CalendarEventInput,
	CalendarEventPresentation,
} from "./types";

const DEFAULT_EVENTS_SCOPE =
	"https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events";
const DEFAULT_FREEBUSY_SCOPE =
	"https://www.googleapis.com/auth/calendar.freebusy";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

interface GoogleServiceAccountCredentials {
	client_email: string;
	private_key: string;
	private_key_id?: string;
	token_uri?: string;
}

interface GoogleTokenResponse {
	access_token: string;
	expires_in: number;
	token_type: string;
}

interface GoogleCalendarEvent {
	description?: string;
	end?: { date?: string; dateTime?: string; timeZone?: string };
	etag?: string;
	iCalUID?: string;
	id: string;
	start?: { date?: string; dateTime?: string; timeZone?: string };
	status?: string;
	summary?: string;
	updated?: string;
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

/**
 * Google Calendar adapter implementing the CalendarAdapter interface.
 *
 * The constructor accepts a default service-account key (used when no
 * per-connection credentials are provided via CalendarConnectionConfig).
 * No process.env reads inside any method.
 */
export class GoogleCalendarAdapter implements CalendarAdapter {
	private readonly serviceAccountKey: GoogleServiceAccountCredentials;
	private readonly eventsScope: string;
	private readonly freeBusyScope: string;
	private readonly fetchImpl: typeof fetch;
	private readonly requestTimeoutMs: number;
	private readonly accessTokenCache = new Map<
		string,
		{ accessToken: string; expiresAt: number }
	>();

	constructor(serviceAccountKey: Record<string, unknown>) {
		if (
			!(serviceAccountKey.client_email && serviceAccountKey.private_key)
		) {
			// Allow empty credentials for local/test environments
			this.serviceAccountKey = {
				client_email: "",
				private_key: "",
			};
		} else {
			this.serviceAccountKey =
				serviceAccountKey as unknown as GoogleServiceAccountCredentials;
		}
		this.eventsScope = DEFAULT_EVENTS_SCOPE;
		this.freeBusyScope = DEFAULT_FREEBUSY_SCOPE;
		this.fetchImpl = (...args) => fetch(...args);
		this.requestTimeoutMs = 20_000;
	}

	async createEvent(
		input: CalendarEventInput,
		config: CalendarConnectionConfig,
	): Promise<CalendarEventPresentation> {
		const credentials = this.resolveCredentials(config);
		const encodedCalendarId = encodeURIComponent(config.calendarId);
		const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`;

		const payload = this.buildEventPayload(input);
		const event = await this.requestGoogleWithCredentials<GoogleCalendarEvent>(
			{ url, method: "POST", body: JSON.stringify(payload) },
			credentials,
		);

		return this.toPresentation(event, config.calendarId);
	}

	async updateEvent(
		eventId: string,
		input: Partial<CalendarEventInput>,
		config: CalendarConnectionConfig,
	): Promise<CalendarEventPresentation> {
		const credentials = this.resolveCredentials(config);
		const encodedCalendarId = encodeURIComponent(config.calendarId);
		const encodedEventId = encodeURIComponent(eventId);
		const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events/${encodedEventId}`;

		const payload: Record<string, unknown> = {};
		if (input.title !== undefined) payload.summary = input.title;
		if (input.description !== undefined) payload.description = input.description;
		if (input.startsAt && input.timezone) {
			payload.start = { dateTime: input.startsAt.toISOString(), timeZone: input.timezone };
		}
		if (input.endsAt && input.timezone) {
			payload.end = { dateTime: input.endsAt.toISOString(), timeZone: input.timezone };
		}
		if (input.metadata) {
			payload.extendedProperties = { private: input.metadata };
		}

		const event = await this.requestGoogleWithCredentials<GoogleCalendarEvent>(
			{ url, method: "PATCH", body: JSON.stringify(payload) },
			credentials,
		);

		return this.toPresentation(event, config.calendarId);
	}

	async deleteEvent(
		eventId: string,
		config: CalendarConnectionConfig,
	): Promise<void> {
		const credentials = this.resolveCredentials(config);
		const encodedCalendarId = encodeURIComponent(config.calendarId);
		const encodedEventId = encodeURIComponent(eventId);
		const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events/${encodedEventId}`;

		try {
			await this.requestGoogleWithCredentials<void>(
				{ url, method: "DELETE" },
				credentials,
			);
		} catch (error) {
			if (error instanceof GoogleCalendarApiError && error.status === 404) {
				return; // Already deleted — treat as success
			}
			throw error;
		}
	}

	async listBusySlots(
		calendarId: string,
		from: Date,
		to: Date,
		config: CalendarConnectionConfig,
	): Promise<BusySlot[]> {
		const credentials = this.resolveCredentials(config);
		const url = "https://www.googleapis.com/calendar/v3/freeBusy";

		const response =
			await this.requestGoogleWithCredentials<GoogleFreeBusyResponse>(
				{
					url,
					method: "POST",
					body: JSON.stringify({
						timeMin: from.toISOString(),
						timeMax: to.toISOString(),
						items: [{ id: calendarId }],
					}),
					freeBusy: true,
				},
				credentials,
			);

		const calendar = response.calendars?.[calendarId];
		if (!calendar) {
			throw new Error(
				`GOOGLE_CALENDAR_FREEBUSY_MISSING: Calendar '${calendarId}' not in response`,
			);
		}
		if (calendar.errors && calendar.errors.length > 0) {
			const reasons = calendar.errors
				.map((e) => e.reason ?? e.message ?? "unknown")
				.join(", ");
			throw new Error(
				`GOOGLE_CALENDAR_FREEBUSY_ERROR: Calendar '${calendarId}' errors: ${reasons}`,
			);
		}

		return (calendar.busy ?? []).map((b) => ({
			startsAt: new Date(b.start),
			endsAt: new Date(b.end),
		}));
	}

	// ─── Private helpers ────────────────────────────────────────────────────

	private resolveCredentials(
		config: CalendarConnectionConfig,
	): GoogleServiceAccountCredentials {
		if (config.credentials?.client_email && config.credentials?.private_key) {
			return config.credentials as unknown as GoogleServiceAccountCredentials;
		}
		return this.serviceAccountKey;
	}

	private buildEventPayload(input: CalendarEventInput): Record<string, unknown> {
		const payload: Record<string, unknown> = {
			summary: input.title,
			start: { dateTime: input.startsAt.toISOString(), timeZone: input.timezone },
			end: { dateTime: input.endsAt.toISOString(), timeZone: input.timezone },
		};
		if (input.description) payload.description = input.description;
		if (input.metadata) payload.extendedProperties = { private: input.metadata };
		if (input.attendeeEmails?.length) {
			payload.attendees = input.attendeeEmails.map((email) => ({ email }));
		}
		return payload;
	}

	private toPresentation(
		event: GoogleCalendarEvent,
		calendarId: string,
	): CalendarEventPresentation {
		return {
			eventId: event.id,
			calendarId,
			syncedAt: event.updated ? (new Date(event.updated)) : new Date(),
			iCalUid: event.iCalUID,
			version: event.etag?.replaceAll('"', ""),
		};
	}

	private async requestGoogleWithCredentials<T>(
		params: { url: string; method: string; body?: string; freeBusy?: boolean },
		credentials: GoogleServiceAccountCredentials,
	): Promise<T> {
		const scope = params.freeBusy ? this.freeBusyScope : this.eventsScope;
		const accessToken = await this.getAccessToken(scope, credentials);

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
				message: `GOOGLE_CALENDAR_REQUEST_FAILED: ${response.status} ${response.statusText}`,
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
		request: Parameters<typeof fetch>[1],
	): Promise<Response> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => {
			controller.abort();
		}, this.requestTimeoutMs);

		try {
			return await this.fetchImpl(url, { ...request, signal: controller.signal });
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private async getAccessToken(
		scope: string,
		credentials: GoogleServiceAccountCredentials,
	): Promise<string> {
		const cacheKey = `${credentials.client_email}:${scope}`;
		const cached = this.accessTokenCache.get(cacheKey);
		const nowMs = Date.now();
		if (cached && cached.expiresAt - nowMs > 30_000) {
			return cached.accessToken;
		}

		const signedJwt = await this.createSignedJwt(scope, credentials);
		const tokenUri = credentials.token_uri ?? DEFAULT_TOKEN_URI;
		const body = new URLSearchParams();
		body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
		body.set("assertion", signedJwt);

		const response = await this.fetchWithTimeout(tokenUri, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString(),
		});

		if (!response.ok) {
			const responseBody = await response.text();
			throw new Error(
				`GOOGLE_CALENDAR_TOKEN_ERROR: ${response.status} ${response.statusText}: ${responseBody}`,
			);
		}

		const tokenPayload = (await response.json()) as GoogleTokenResponse;
		const expiresAt = nowMs + tokenPayload.expires_in * 1000;
		this.accessTokenCache.set(cacheKey, {
			accessToken: tokenPayload.access_token,
			expiresAt,
		});
		return tokenPayload.access_token;
	}

	private async createSignedJwt(
		scope: string,
		credentials: GoogleServiceAccountCredentials,
	): Promise<string> {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const payload = {
			iss: credentials.client_email,
			scope,
			aud: credentials.token_uri ?? DEFAULT_TOKEN_URI,
			iat: nowSeconds,
			exp: nowSeconds + 3600,
		};

		const encodedHeader = this.base64UrlEncodeJson({ alg: "RS256", typ: "JWT" });
		const encodedPayload = this.base64UrlEncodeJson(payload);
		const unsignedJwt = `${encodedHeader}.${encodedPayload}`;

		const privateKey = await this.importPrivateKey(credentials.private_key);
		const signature = await crypto.subtle.sign(
			"RSASSA-PKCS1-v1_5",
			privateKey,
			this.encodeUtf8(unsignedJwt),
		);
		return `${unsignedJwt}.${this.base64UrlEncodeBytes(new Uint8Array(signature))}`;
	}

	private async importPrivateKey(privateKeyPem: string) {
		const sanitized = privateKeyPem
			.replace("-----BEGIN PRIVATE KEY-----", "")
			.replace("-----END PRIVATE KEY-----", "")
			.replaceAll("\r", "")
			.replaceAll("\n", "")
			.trim();

		const pkcs8Bytes = this.base64Decode(sanitized);
		const buffer = pkcs8Bytes.buffer.slice(
			pkcs8Bytes.byteOffset,
			pkcs8Bytes.byteOffset + pkcs8Bytes.byteLength,
		) as ArrayBuffer;
		return crypto.subtle.importKey(
			"pkcs8",
			buffer,
			{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
			false,
			["sign"],
		);
	}

	private base64UrlEncodeJson(value: object) {
		return this.base64UrlEncodeBytes(this.encodeUtf8(JSON.stringify(value)));
	}

	private encodeUtf8(value: string) {
		return new TextEncoder().encode(value);
	}

	private base64UrlEncodeBytes(value: Uint8Array) {
		return this.base64Encode(value)
			.replaceAll("+", "-")
			.replaceAll("/", "_")
			.replace(/=+$/, "");
	}

	private base64Encode(value: Uint8Array): string {
		if (typeof Buffer !== "undefined") {
			return Buffer.from(value).toString("base64");
		}
		let binary = "";
		for (const byte of value) {
			binary += String.fromCharCode(byte);
		}
		return btoa(binary);
	}

	private base64Decode(value: string): Uint8Array {
		if (typeof Buffer !== "undefined") {
			return Buffer.from(value, "base64");
		}
		const binary = atob(value);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}
}
