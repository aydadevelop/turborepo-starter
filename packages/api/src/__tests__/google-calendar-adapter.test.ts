import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { GoogleCalendarAdapter } from "../calendar/adapters/google-calendar-adapter";

const createCredentials = () => {
	const { privateKey } = generateKeyPairSync("rsa", {
		modulusLength: 2048,
	});
	return {
		client_email: "calendar-test@example.iam.gserviceaccount.com",
		private_key: privateKey.export({
			type: "pkcs8",
			format: "pem",
		}) as string,
		token_uri: "https://oauth2.googleapis.com/token",
	};
};

const createGoogleFetchMock = (params: {
	handleApiRequest: (request: {
		url: URL;
		init: RequestInit | undefined;
	}) => Response;
}) => {
	return (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		if (url.href === "https://oauth2.googleapis.com/token") {
			return Promise.resolve(
				new Response(
					JSON.stringify({
						access_token: "test-access-token",
						expires_in: 3600,
						token_type: "Bearer",
					}),
					{
						status: 200,
						headers: {
							"Content-Type": "application/json",
						},
					}
				)
			);
		}

		return Promise.resolve(
			params.handleApiRequest({
				url,
				init,
			})
		);
	};
};

describe("google calendar adapter", () => {
	it("maps semantic presentation to Google status/color", async () => {
		const requests: Array<{ url: URL; body: unknown }> = [];
		const adapter = new GoogleCalendarAdapter({
			credentials: createCredentials(),
			fetchImpl: createGoogleFetchMock({
				handleApiRequest: ({ url, init }) => {
					const body = init?.body ? JSON.parse(String(init.body)) : undefined;
					requests.push({ url, body });
					return new Response(
						JSON.stringify({
							id: "evt-presentation",
							status: "confirmed",
							iCalUID: "evt-presentation@google.com",
							etag: '"v1"',
							updated: "2026-06-01T10:00:00.000Z",
						}),
						{
							status: 200,
							headers: {
								"Content-Type": "application/json",
							},
						}
					);
				},
			}),
		});

		await adapter.upsertEvent({
			externalCalendarId: "calendar-1",
			externalEventId: "evt-1",
			title: "Prebooking",
			presentation: "prebooking",
			startsAt: new Date("2026-06-01T10:00:00.000Z"),
			endsAt: new Date("2026-06-01T12:00:00.000Z"),
			timezone: "UTC",
		});

		await adapter.upsertEvent({
			externalCalendarId: "calendar-1",
			externalEventId: "evt-1",
			title: "Confirmed",
			presentation: "confirmed",
			startsAt: new Date("2026-06-01T10:00:00.000Z"),
			endsAt: new Date("2026-06-01T12:00:00.000Z"),
			timezone: "UTC",
		});

		const prebookingRequest = requests[0];
		if (!prebookingRequest) {
			throw new Error("Expected prebooking request");
		}
		expect(prebookingRequest.body).toMatchObject({
			status: "tentative",
			colorId: "8",
		});

		const confirmedRequest = requests[1];
		if (!confirmedRequest) {
			throw new Error("Expected confirmed request");
		}
		expect(confirmedRequest.body).toMatchObject({
			status: "confirmed",
			colorId: "0",
		});
	});

	it("lists events with incremental sync metadata", async () => {
		const requests: URL[] = [];
		const adapter = new GoogleCalendarAdapter({
			credentials: createCredentials(),
			fetchImpl: createGoogleFetchMock({
				handleApiRequest: ({ url }) => {
					requests.push(url);
					return new Response(
						JSON.stringify({
							items: [
								{
									id: "evt_1",
									status: "confirmed",
									summary: "Evening rent",
									description: "Captain included",
									start: {
										dateTime: "2026-06-01T10:00:00.000Z",
										timeZone: "UTC",
									},
									end: {
										dateTime: "2026-06-01T13:00:00.000Z",
										timeZone: "UTC",
									},
									iCalUID: "evt_1@google.com",
									etag: '"version-2"',
									updated: "2026-05-30T08:00:00.000Z",
								},
							],
							nextSyncToken: "sync-token-2",
							nextPageToken: "next-page-1",
						}),
						{
							status: 200,
							headers: {
								"Content-Type": "application/json",
							},
						}
					);
				},
			}),
		});

		const result = await adapter.listEvents({
			externalCalendarId:
				"c49761117c02099560fda595adc795ae21bc03df82a440c266865967c099e5e0@group.calendar.google.com",
			timeMin: new Date("2026-06-01T00:00:00.000Z"),
			timeMax: new Date("2026-06-02T00:00:00.000Z"),
			maxResults: 100,
		});

		expect(requests).toHaveLength(1);
		const listRequest = requests[0];
		if (!listRequest) {
			throw new Error("Expected a Google events request");
		}
		expect(listRequest.pathname).toContain("/events");
		expect(listRequest.searchParams.get("showDeleted")).toBe("true");
		expect(listRequest.searchParams.get("singleEvents")).toBe("true");
		expect(result.nextSyncToken).toBe("sync-token-2");
		expect(result.nextPageToken).toBe("next-page-1");
		expect(result.events).toHaveLength(1);
		expect(result.events[0]).toMatchObject({
			externalEventId: "evt_1",
			status: "confirmed",
			title: "Evening rent",
			timezone: "UTC",
			iCalUid: "evt_1@google.com",
			version: "version-2",
		});
	});

	it("creates and stops webhook channels", async () => {
		const requests: Array<{ url: URL; body: unknown }> = [];
		const adapter = new GoogleCalendarAdapter({
			credentials: createCredentials(),
			fetchImpl: createGoogleFetchMock({
				handleApiRequest: ({ url, init }) => {
					const body = init?.body ? JSON.parse(String(init.body)) : undefined;
					requests.push({ url, body });

					if (url.pathname.endsWith("/events/watch")) {
						return new Response(
							JSON.stringify({
								id: "channel-1",
								resourceId: "resource-1",
								resourceUri:
									"https://www.googleapis.com/calendar/v3/calendars/calendar/events",
								expiration: "1760000000000",
							}),
							{
								status: 200,
								headers: {
									"Content-Type": "application/json",
								},
							}
						);
					}

					if (url.pathname.endsWith("/channels/stop")) {
						return new Response(null, { status: 204 });
					}

					return new Response("Not found", { status: 404 });
				},
			}),
		});

		const channel = await adapter.startWatch({
			externalCalendarId: "calendar-id",
			webhookUrl: "https://example.trycloudflare.com/webhooks/calendar/google",
			channelToken: "shared-token",
			ttlSeconds: 3600,
		});

		expect(channel.channelId).toBe("channel-1");
		expect(channel.resourceId).toBe("resource-1");
		expect(channel.expirationAt?.toISOString()).toBe(
			"2025-10-09T08:53:20.000Z"
		);
		const watchRequest = requests[0];
		if (!watchRequest) {
			throw new Error("Expected a Google watch request");
		}
		expect(watchRequest.body).toMatchObject({
			type: "web_hook",
			address: "https://example.trycloudflare.com/webhooks/calendar/google",
			token: "shared-token",
			params: {
				ttl: "3600",
			},
		});

		await adapter.stopWatch({
			channelId: channel.channelId,
			resourceId: channel.resourceId,
		});
		const stopRequest = requests[1];
		if (!stopRequest) {
			throw new Error("Expected a Google stop-channel request");
		}
		expect(stopRequest.url.pathname).toBe("/calendar/v3/channels/stop");
		expect(stopRequest.body).toEqual({
			id: "channel-1",
			resourceId: "resource-1",
		});
	});

	it("parses webhook headers", () => {
		const adapter = new GoogleCalendarAdapter({
			credentials: createCredentials(),
		});

		const parsed = adapter.parseWebhookNotification({
			"X-Goog-Channel-ID": "channel-2",
			"X-Goog-Resource-ID": "resource-2",
			"X-Goog-Resource-State": "exists",
			"X-Goog-Message-Number": "42",
			"X-Goog-Resource-Uri":
				"https://www.googleapis.com/calendar/v3/calendars/c/events",
			"X-Goog-Channel-Token": "token-2",
			"X-Goog-Channel-Expiration": "Wed, 01 Jan 2026 00:00:00 GMT",
		});

		expect(parsed).toEqual({
			channelId: "channel-2",
			resourceId: "resource-2",
			resourceState: "exists",
			messageNumber: 42,
			resourceUri: "https://www.googleapis.com/calendar/v3/calendars/c/events",
			channelToken: "token-2",
			channelExpiration: new Date("2026-01-01T00:00:00.000Z"),
		});
	});

	it("returns null for incomplete webhook headers", () => {
		const adapter = new GoogleCalendarAdapter({
			credentials: createCredentials(),
		});

		expect(adapter.parseWebhookNotification({})).toBeNull();
	});
});
