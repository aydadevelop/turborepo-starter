import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
	GoogleCalendarAdapter,
	GoogleCalendarApiError,
} from "../calendar/adapters/google-calendar-adapter";

const isNetworkTestRun = process.env.RUN_NETWORK_TESTS === "1";
const isWebhookNetworkTestRun = process.env.RUN_WEBHOOK_NETWORK_TESTS === "1";
const defaultCredentialsCandidates = [
	path.resolve(
		process.cwd(),
		"apps/server/.secrets/google-calendar.credentials.json"
	),
	path.resolve(
		process.cwd(),
		"../../apps/server/.secrets/google-calendar.credentials.json"
	),
];
const defaultCredentialsPath: string =
	defaultCredentialsCandidates.find((candidatePath) =>
		existsSync(candidatePath)
	) ??
	path.resolve(
		process.cwd(),
		"apps/server/.secrets/google-calendar.credentials.json"
	);

const credentialsPath: string =
	process.env.GOOGLE_CALENDAR_CREDENTIALS_PATH ?? defaultCredentialsPath;
const fullAccessCalendarId =
	process.env.GOOGLE_CALENDAR_TEST_FULL_ACCESS_ID ??
	"c49761117c02099560fda595adc795ae21bc03df82a440c266865967c099e5e0@group.calendar.google.com";
const readOnlyCalendarId =
	process.env.GOOGLE_CALENDAR_TEST_READ_ONLY_ID ??
	"03ffc22988f8023adf80cb636b45013fe2a9f38e6b1275a46052fc34dc5a4370@group.calendar.google.com";
const noAccessCalendarId =
	process.env.GOOGLE_CALENDAR_TEST_NO_ACCESS_ID ??
	"f43a00d530e21e2e472823e1dc9b78664f2dac9b676b3f0e768891644cad8270@group.calendar.google.com";
const webhookUrl = process.env.GOOGLE_CALENDAR_TEST_WEBHOOK_URL;

const sleep = (milliseconds: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});

const ensureCredentialsFile = () => {
	if (!existsSync(credentialsPath)) {
		throw new Error(
			`Google calendar credentials file not found: ${credentialsPath}`
		);
	}
};

const loadCredentials = () => {
	ensureCredentialsFile();
	const rawCredentials = readFileSync(credentialsPath, "utf8");
	return JSON.parse(rawCredentials) as {
		client_email: string;
		private_key: string;
		token_uri?: string;
	};
};

describe.skipIf(!isNetworkTestRun)("google calendar adapter (network)", () => {
	const adapter = new GoogleCalendarAdapter({
		credentials: loadCredentials(),
	});
	const createdEvents: Array<{ calendarId: string; eventId: string }> = [];

	afterAll(async () => {
		for (const createdEvent of createdEvents) {
			try {
				await adapter.deleteEvent({
					externalCalendarId: createdEvent.calendarId,
					externalEventId: createdEvent.eventId,
				});
			} catch (error) {
				if (
					error instanceof GoogleCalendarApiError &&
					(error.status === 404 || error.status === 410)
				) {
					continue;
				}
				console.error("Failed to cleanup integration test event", error);
			}
		}
	});

	it("creates and deletes events on the full-access calendar", async () => {
		const eventId = `codexint${Date.now()}`;
		const startsAt = new Date(Date.now() + 90 * 60 * 1000);
		const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

		const createdEvent = await adapter.upsertEvent({
			externalCalendarId: fullAccessCalendarId,
			externalEventId: eventId,
			title: "Codex Integration Test",
			startsAt,
			endsAt,
			timezone: "UTC",
			metadata: {
				source: "codex-integration-test",
			},
		});

		createdEvents.push({
			calendarId: fullAccessCalendarId,
			eventId: createdEvent.externalEventId,
		});

		expect(createdEvent.externalEventId).toBeTruthy();

		let foundOverlap = false;
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const busyIntervals = await adapter.listBusyIntervals({
				externalCalendarId: fullAccessCalendarId,
				from: new Date(startsAt.getTime() - 15 * 60 * 1000),
				to: new Date(endsAt.getTime() + 15 * 60 * 1000),
			});
			foundOverlap = busyIntervals.some(
				(interval) => interval.startsAt < endsAt && interval.endsAt > startsAt
			);
			if (foundOverlap) {
				break;
			}
			await sleep(1500);
		}

		expect(foundOverlap).toBe(true);

		await adapter.deleteEvent({
			externalCalendarId: fullAccessCalendarId,
			externalEventId: createdEvent.externalEventId,
		});
		const eventIndex = createdEvents.findIndex(
			(event) =>
				event.calendarId === fullAccessCalendarId &&
				event.eventId === createdEvent.externalEventId
		);
		if (eventIndex >= 0) {
			createdEvents.splice(eventIndex, 1);
		}
	}, 20_000);

	it("fails to create events on read-only calendars", async () => {
		const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
		const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

		try {
			await adapter.upsertEvent({
				externalCalendarId: readOnlyCalendarId,
				title: "Codex Read-only Check",
				startsAt,
				endsAt,
				timezone: "UTC",
			});
			throw new Error("Expected upsertEvent to fail on read-only calendar");
		} catch (error) {
			expect(error).toBeInstanceOf(GoogleCalendarApiError);
			if (error instanceof GoogleCalendarApiError) {
				expect([401, 403]).toContain(error.status);
			}
		}
	});

	it("fails to read busy intervals on no-access calendars", async () => {
		const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
		const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

		await expect(
			adapter.listBusyIntervals({
				externalCalendarId: noAccessCalendarId,
				from: startsAt,
				to: endsAt,
			})
		).rejects.toThrow();
	});

	it("lists events for full-access calendars", async () => {
		const timeMin = new Date(Date.now() - 3 * 60 * 60 * 1000);
		const timeMax = new Date(Date.now() + 24 * 60 * 60 * 1000);

		const result = await adapter.listEvents({
			externalCalendarId: fullAccessCalendarId,
			timeMin,
			timeMax,
			maxResults: 25,
		});

		expect(Array.isArray(result.events)).toBe(true);
		expect(result.events.length).toBeGreaterThanOrEqual(0);
		expect(
			result.events.every(
				(event) =>
					typeof event.externalEventId === "string" &&
					event.externalEventId.length > 0
			)
		).toBe(true);
	});
});

describe.skipIf(
	!(
		isNetworkTestRun &&
		isWebhookNetworkTestRun &&
		typeof webhookUrl === "string" &&
		webhookUrl.length > 0
	)
)("google calendar adapter (webhook network)", () => {
	const adapter = new GoogleCalendarAdapter({
		credentials: loadCredentials(),
	});

	it("creates and stops watch channels when webhook URL is reachable", async () => {
		if (!webhookUrl) {
			throw new Error("GOOGLE_CALENDAR_TEST_WEBHOOK_URL is required");
		}
		const watchChannel = await adapter.startWatch({
			externalCalendarId: fullAccessCalendarId,
			webhookUrl,
			channelToken: process.env.GOOGLE_CALENDAR_WEBHOOK_TEST_TOKEN,
			ttlSeconds: 3600,
		});

		expect(watchChannel.channelId).toBeTruthy();
		expect(watchChannel.resourceId).toBeTruthy();

		await adapter.stopWatch({
			channelId: watchChannel.channelId,
			resourceId: watchChannel.resourceId,
		});
	}, 20_000);
});
