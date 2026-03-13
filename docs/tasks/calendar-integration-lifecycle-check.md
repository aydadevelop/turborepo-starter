# Calendar Integration Lifecycle Check

## Goal
- Verify the real provider-backed calendar lifecycle against a seeded local environment.
- Confirm the account-first flow works end to end:
  - connect provider account
  - discover calendars
  - attach a source to a listing
  - create a booking and observe event creation
  - reschedule the booking and observe event update
  - cancel the booking and observe event removal or cancellation handling

## Preconditions
- Local Postgres is running.
- Local server and web app can be started.
- Google calendar OAuth env is configured:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- Use a dedicated Google account and dedicated calendars for testing.

## Seed
Run:

```bash
bun packages/db/scripts/reset-local.mjs
bun packages/db/scripts/seed-local.mjs --profile=calendar-integration
```

Use the seeded operator:
- `operator@example.com`
- `operator`

The integration profile adds a dedicated listing:
- slug: `calendar-integration-test-boat`

## Start services
Run the normal local app stack and wait for:
- web: `http://localhost:5173`
- server: `http://localhost:3000`

## Operator flow
1. Sign in as the seeded operator.
2. Open the integration listing workspace:
   - `/org/listings/seed_listing_boat_calendar_integration`
3. In the calendar section:
   - click `Connect Google`
   - complete OAuth
   - confirm the success notice is shown
4. Refresh account sources if needed.
5. Attach one discovered Google calendar to the integration listing.
6. Capture screenshots for:
   - connected account
   - discovered sources
   - attached source

## Customer flow
1. Open the public listing detail page:
   - `/listings/seed_listing_boat_calendar_integration`
2. Pick a valid date and create a booking request.
3. Confirm a booking row exists and a provider event was created in the attached Google calendar.
4. Capture:
   - booking confirmation state in the app
   - created event in Google Calendar

## Reschedule check
There is no dedicated operator UI for rescheduling yet, so use an authenticated browser session to call the booking update route through the app’s oRPC client.

Target mutation:
- `booking.updateSchedule`

Expected behavior:
- booking row `startsAt` / `endsAt` updates
- linked provider event time window updates in Google Calendar
- no duplicate event is created

Capture:
- updated booking state in the app or DB
- updated external event in Google Calendar

## Cancellation check
1. Cancel the booking through the existing operator flow or mutation path.
2. Confirm the provider event is removed or otherwise transitioned correctly by the provider adapter path.

Capture:
- cancelled booking state
- external calendar result

## Output
Produce a short report with:
- env used
- account email used for Google connect
- attached calendar name/id
- booking id used
- whether create/update/cancel each succeeded
- screenshots and any console/server errors

## Failure notes
- If OAuth succeeds but no sources are found, record the account and provider response state.
- If create works but update or cancel fails, include:
  - booking id
  - listing id
  - provider event id
  - connection id
  - relevant server logs
