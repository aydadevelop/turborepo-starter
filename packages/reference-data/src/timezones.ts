const FALLBACK_TIMEZONES = [
	"UTC",
	"Europe/London",
	"Europe/Berlin",
	"Europe/Moscow",
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Los_Angeles",
	"Asia/Dubai",
	"Asia/Singapore",
	"Asia/Tokyo",
] as const;

function loadSupportedTimezones(): string[] {
	const intl = Intl as typeof Intl & {
		supportedValuesOf?: (key: string) => string[];
	};

	if (typeof intl.supportedValuesOf === "function") {
		return [...intl.supportedValuesOf("timeZone")].sort((left, right) =>
			left.localeCompare(right)
		);
	}

	return [...FALLBACK_TIMEZONES];
}

export const SUPPORTED_TIMEZONES = loadSupportedTimezones();

const timezoneSet = new Set(SUPPORTED_TIMEZONES);

export function isSupportedTimezone(value: string): boolean {
	return timezoneSet.has(value);
}
