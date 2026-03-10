import type { CalendarAdapter, CalendarAdapterProvider } from "./types";

const adapterRegistry = new Map<CalendarAdapterProvider, CalendarAdapter>();

/**
 * Register a CalendarAdapter for the given provider string.
 * Call this at application startup before any calendar operations are performed.
 */
export const registerCalendarAdapter = (
	provider: CalendarAdapterProvider,
	adapter: CalendarAdapter,
): void => {
	adapterRegistry.set(provider, adapter);
};

/**
 * Retrieve a registered CalendarAdapter by provider.
 * Throws a descriptive error if the provider has not been registered.
 */
export const getCalendarAdapter = (
	provider: CalendarAdapterProvider,
): CalendarAdapter => {
	const adapter = adapterRegistry.get(provider);
	if (!adapter) {
		throw new Error(`NO_CALENDAR_ADAPTER: ${provider}`);
	}
	return adapter;
};

/** For use in tests: clear all registered adapters. */
export const clearCalendarAdapterRegistry = (): void => {
	adapterRegistry.clear();
};
