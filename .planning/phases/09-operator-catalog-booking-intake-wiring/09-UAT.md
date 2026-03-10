---
status: testing
phase: 09-operator-catalog-booking-intake-wiring
source: 09-01-SUMMARY.md, 09-02-SUMMARY.md, 09-03-SUMMARY.md
started: 2026-03-10T12:58:11Z
updated: 2026-03-10T12:58:11Z
---

## Current Test

number: 1
name: Operator listings shell access
expected: |
  When you sign in as an operator with an active organization and open `/org`, you should see a `Listings` tab in the existing org shell. Opening `/org/listings` should show your organization's listings, a create button, and no second dashboard namespace.
awaiting: user response

## Tests

### 1. Operator listings shell access
expected: When you sign in as an operator with an active organization and open `/org`, you should see a `Listings` tab in the existing org shell. Opening `/org/listings` should show your organization's listings, a create button, and no second dashboard namespace.
result: [pending]

### 2. Create listing from the live app
expected: From `/org/listings/new`, you should be able to enter listing type, name, slug, timezone, description, and valid metadata JSON, submit the form, and land back on `/org/listings` with the new listing visible.
result: [pending]

### 3. Edit listing details and metadata validation
expected: Opening `/org/listings/[id]` for an existing listing should load its current data, keep slug and listing type visible, reject invalid metadata JSON before submit, and save valid edits back to the listings index.
result: [pending]

### 4. Publish and unpublish listing
expected: From `/org/listings`, publishing or unpublishing a listing should show inline pending state, update the status badge, and refresh the list without a manual page reload.
result: [pending]

### 5. Public quote and availability preview
expected: On `/listings/[id]`, selecting a valid start and end time should trigger live quote and availability feedback in the booking panel, showing either pricing details or an inline unavailable/error state.
result: [pending]

### 6. Booking submission auth gate and happy path
expected: On `/listings/[id]`, clicking the final booking button while signed out should redirect to login with a return URL. While signed in, submitting a valid request should create the booking and show a success state with the booking id and total.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0

## Gaps

