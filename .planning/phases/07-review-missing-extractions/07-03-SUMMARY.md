---
phase: 07-review-missing-extractions
plan: "03"
subsystem: calendar
tags: [calendar, google, events, sync, server]

requires:
	- phase: 07-review-missing-extractions
		provides: "CalendarAdapter interface, registry, and package scaffold"
	- phase: 02-events-workflows-parity-foundations
		provides: "typed event bus registration for side-effect subscribers"
provides:
	- "GoogleCalendarAdapter implementation with Web Crypto JWT auth"
	- "Calendar use cases for connect, disconnect, and busy-slot lookup"
	- "Booking lifecycle event subscriber for outbound calendar sync"
affects: [calendar, booking, events, server-runtime]

tech-stack:
	added: []
	patterns:
		- "Server startup registers concrete adapters and then registers lifecycle subscribers"
		- "Calendar sync failures are logged and swallowed so bookings are not blocked by external calendar issues"

key-files:
	created:
		- packages/calendar/src/google-adapter.ts
		- packages/calendar/src/use-cases.ts
		- packages/calendar/src/booking-lifecycle-sync.ts
	modified:
		- packages/calendar/src/index.ts
		- apps/server/src/index.ts
		- apps/server/package.json

key-decisions:
	- "Google Calendar auth uses Web Crypto directly instead of another auth client dependency"
	- "Credentials resolve from explicit config before constructor defaults"

patterns-established:
	- "Concrete calendar adapters remain provider-specific while package use cases stay provider-agnostic"
	- "Lifecycle subscribers upsert external-link records so retries stay idempotent"

requirements-completed:
	- EXTR-03

duration: "n/a"
completed: 2026-03-10
---

# Phase 07-03 Summary: Google Calendar Adapter + Use Cases + Lifecycle Sync

## Objective
Implement the concrete GoogleCalendarAdapter, calendar use-case helpers, and booking-lifecycle synchronization event pusher that keeps external Google Calendars in sync with booking state changes.

## Artifacts Created

### `packages/calendar/src/google-adapter.ts`
- `GoogleCalendarAdapter` class implementing `CalendarAdapter` interface
- Constructor: `new GoogleCalendarAdapter(serviceAccountKey: Record<string, unknown>)`
- Methods: `createEvent`, `updateEvent`, `deleteEvent`, `listBusySlots`
- Internal JWT/OAuth2 flow using Web Crypto API (no third-party auth library)
- Access token cache (Map<scope:email, { accessToken, expiresAt }>) with 30s buffer
- Silently ignores 404 on `deleteEvent`
- `GoogleCalendarApiError` class for HTTP-level errors
- No `process.env` reads inside any method — credentials from constructor/config

### `packages/calendar/src/use-cases.ts`
- `connectCalendar(input, db)` → inserts `listingCalendarConnection` row, returns new id
- `disconnectCalendar(connectionId, db)` → sets `isActive = false`
- `listCalendarBusySlots(connectionId, from, to, db)` → loads connection, delegates to adapter

### `packages/calendar/src/booking-lifecycle-sync.ts`
- `registerBookingLifecycleSync(db)` → registers single event pusher for all booking events
- Handles: `booking:confirmed` (create event + upsert `bookingCalendarLink`), `booking:cancelled` (delete event), `booking:contact-updated` (update event description)
- Calendar sync failures are non-fatal (logged, not thrown) to avoid blocking booking state

### `packages/calendar/src/index.ts` (updated)
Added exports: `GoogleCalendarAdapter`, `GoogleCalendarApiError`, `connectCalendar`, `disconnectCalendar`, `listCalendarBusySlots`, `registerBookingLifecycleSync`

### `apps/server/src/index.ts` (updated)
- Added import of `@my-app/calendar` adapter registration and lifecycle sync
- `registerCalendarAdapter("google", new GoogleCalendarAdapter(...))` before HTTP listener
- `registerBookingLifecycleSync(db)` at startup
- `GOOGLE_SERVICE_ACCOUNT_KEY` read from `process.env` (JSON.parsed safely)

### `apps/server/package.json` (updated)
Added `"@my-app/calendar": "workspace:*"` dependency

## Verification
- `npx tsc --noEmit -p packages/calendar/tsconfig.json` → clean
- `npx tsc --noEmit -p apps/server/tsconfig.json` → clean
- Committed: `7de7e8f`

## Key Decisions
- `CryptoKey` return type avoided in private method to prevent `lib.dom` dependency conflict
- Calendar sync errors are non-fatal: logged to console, booking proceeds
- Credentials resolution: `config.credentials` override first, then constructor `serviceAccountKey`
- `bookingCalendarLink` upserted on conflict to handle idempotent retry
