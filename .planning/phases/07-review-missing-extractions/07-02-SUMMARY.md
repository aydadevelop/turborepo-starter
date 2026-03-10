---
phase: 07-review-missing-extractions
plan: "02"
subsystem: calendar
tags: [calendar, adapter, registry, fake-adapter, integration]

requires:
	- phase: 02-events-workflows-parity-foundations
		provides: "typed event bus conventions for external side effects"
provides:
	- "CalendarAdapter interface and provider registry"
	- "FakeCalendarAdapter for in-memory testing"
	- "Package scaffold for future calendar providers"
affects: [calendar, booking, events, integrations]

tech-stack:
	added: []
	patterns:
		- "External calendar integrations sit behind provider-specific adapters registered by provider key"
		- "Adapters receive credentials through config objects rather than reading process.env internally"

key-files:
	created:
		- packages/calendar/package.json
		- packages/calendar/tsconfig.json
		- packages/calendar/vitest.config.ts
		- packages/calendar/src/types.ts
		- packages/calendar/src/adapter-registry.ts
		- packages/calendar/src/fake-adapter.ts
		- packages/calendar/src/index.ts
	modified: []

key-decisions:
	- "The calendar adapter surface is intentionally slim: create, update, delete, and list busy slots"
	- "clearCalendarAdapterRegistry exists for deterministic test isolation"

patterns-established:
	- "Calendar providers are swappable through an adapter registry keyed by provider name"
	- "Package scaffolds include a fake adapter first so downstream integration work has a test double"

requirements-completed: []

duration: "n/a"
completed: 2026-03-10
---

# Plan 07-02 Summary — packages/calendar Scaffold

## What Was Built

Created the new `packages/calendar` package with foundational types, CalendarAdapter interface, adapter registry, and FakeCalendarAdapter.

## Files Created

### packages/calendar/package.json
- Name: `@my-app/calendar`
- Dependencies: `@my-app/db` (workspace), `@my-app/events` (workspace), `drizzle-orm`
- Scripts: `test`, `test:watch`, `typecheck`

### packages/calendar/tsconfig.json + vitest.config.ts
- Follows same shape as `packages/support`

### packages/calendar/src/types.ts
- `CalendarAdapterProvider` — `"google" | "outlook" | "ical" | "manual"`
- `CalendarEventInput` — event data (title, description, startsAt, endsAt, timezone, attendees, metadata)
- `CalendarEventPresentation` — result of create/update (eventId, calendarId, syncedAt, iCalUid, version)
- `CalendarConnectionConfig` — per-connection config (provider, credentials, calendarId) — credentials NOT read from process.env
- `BusySlot` — `{startsAt, endsAt, externalEventId?}`
- `CalendarAdapter` interface — `createEvent`, `updateEvent`, `deleteEvent`, `listBusySlots`

### packages/calendar/src/adapter-registry.ts
- `registerCalendarAdapter(provider, adapter)` — register by provider string
- `getCalendarAdapter(provider)` — throws `Error("NO_CALENDAR_ADAPTER: {provider}")` if not registered
- `clearCalendarAdapterRegistry()` — test utility

### packages/calendar/src/fake-adapter.ts
- `FakeCalendarAdapter` — in-memory implementation of `CalendarAdapter`
- Stores events in a Map keyed by `calendarId:eventId`
- `createEvent`: generates UUID eventId, stores record
- `updateEvent`: merges changes, increments version
- `deleteEvent`: removes from map
- `listBusySlots`: returns all events in calendar overlapping the query window
- Test helpers: `getAllEvents(calendarId)`, `clear()`

### packages/calendar/src/index.ts
- Barrel export of all types + registry + FakeCalendarAdapter

## Key Decisions

- Simplified CalendarAdapter interface (4 methods) vs legacy's richer interface — meets the plan spec
- Credentials accepted via `CalendarConnectionConfig`, never read from `process.env` inside adapters
- `clearCalendarAdapterRegistry` added for test isolation (not in every legacy version but needed)

## Verification

- `npx tsc --noEmit -p packages/calendar/tsconfig.json` — passes cleanly
- `ls packages/calendar/src/` — types.ts, adapter-registry.ts, fake-adapter.ts, index.ts present
- `grep -c "CalendarAdapter|registerCalendarAdapter|FakeCalendarAdapter" packages/calendar/src/index.ts` → 6
