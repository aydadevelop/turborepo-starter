import {
	GoogleCalendarAdapter,
	isGoogleServiceAccountCredentials,
} from "./google-calendar-adapter";
import { registerCalendarAdapter } from "./registry";

interface CalendarAdapterEnvironment {
	GOOGLE_CALENDAR_CREDENTIALS_JSON?: string;
}

let googleCalendarAdapterConfigured = false;

export const configureCalendarAdaptersFromEnv = (
	environment: CalendarAdapterEnvironment
) => {
	if (googleCalendarAdapterConfigured) {
		return;
	}

	const rawCredentials = environment.GOOGLE_CALENDAR_CREDENTIALS_JSON?.trim();
	if (!rawCredentials) {
		return;
	}

	try {
		const parsedCredentials = JSON.parse(rawCredentials) as unknown;
		if (!isGoogleServiceAccountCredentials(parsedCredentials)) {
			console.error(
				"GOOGLE_CALENDAR_CREDENTIALS_JSON is set but does not match a Google service account JSON payload"
			);
			return;
		}

		registerCalendarAdapter(
			new GoogleCalendarAdapter({
				credentials: parsedCredentials,
			})
		);
		googleCalendarAdapterConfigured = true;
	} catch (error) {
		console.error("Failed to configure Google calendar adapter", error);
	}
};
