export type {
	CalendarAdapter,
	CalendarAdapterProvider,
	CalendarConnectionConfig,
	CalendarEventInput,
	CalendarEventPresentation,
	BusySlot,
} from "./types";
export {
	registerCalendarAdapter,
	getCalendarAdapter,
	clearCalendarAdapterRegistry,
} from "./adapter-registry";
export { FakeCalendarAdapter } from "./fake-adapter";
