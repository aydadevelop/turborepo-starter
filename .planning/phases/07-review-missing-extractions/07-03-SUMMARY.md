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
