import { FakeCalendarAdapter } from "./fake-calendar-adapter";
import type { CalendarAdapter, CalendarAdapterProvider } from "./types";

const createDefaultAdapters = () =>
	new Map<CalendarAdapterProvider, CalendarAdapter>([
		["manual", new FakeCalendarAdapter()],
	]);

const adapterRegistry = createDefaultAdapters();

export const registerCalendarAdapter = (adapter: CalendarAdapter) => {
	adapterRegistry.set(adapter.provider, adapter);
};

export const registerCalendarAdapters = (
	adapters: Partial<Record<CalendarAdapterProvider, CalendarAdapter>>
) => {
	for (const [provider, adapter] of Object.entries(adapters)) {
		if (adapter) {
			adapterRegistry.set(provider as CalendarAdapterProvider, adapter);
		}
	}
};

export const getCalendarAdapter = (
	provider: CalendarAdapterProvider
): CalendarAdapter | null => {
	return adapterRegistry.get(provider) ?? null;
};

export const resetCalendarAdapterRegistry = () => {
	adapterRegistry.clear();
	for (const [provider, adapter] of createDefaultAdapters()) {
		adapterRegistry.set(provider, adapter);
	}
};
