# Calendar-Linked Booking Lifecycle

This document describes how inbound external calendar changes affect managed bookings.

## Scope

Rules apply when an external event is linked to a booking through `booking_calendar_link` (`provider + externalCalendarId + externalEventId`).

## Inbound lifecycle rules

1. External event time changed
- System creates or replaces a `booking_shift_request`.
- Request is created in `pending` status.
- Initiator side is treated as manager-originated:
  - `managerDecision = approved`
  - `customerDecision = pending`
- Booking record is **not** shifted automatically.
- Price fields are preserved from current booking snapshot (no automatic repricing).

2. External event deleted/cancelled (or event has invalid interval)
- System creates or resets a `booking_cancellation_request` in `requested` status.
- Booking record is **not** auto-cancelled.
- Cancellation still requires managed review/approval flow.

3. Terminal bookings
- For `cancelled`, `completed`, `no_show`, inbound event lifecycle actions are ignored.

## Availability block behavior

Inbound sync still updates `boat_availability_block` as before:
- Active block for valid external intervals.
- Deactivated block for cancelled/invalid external events.

## Notifications

1. Booking created in app
- Recipients include:
  - booking customer
  - booking creator/actor
  - organization members with booking update permission (`booking: ["update"]`)
- This covers owner-side roles (for example `org_owner`, `org_admin`, `manager`, `agent`) based on current permission map.

2. External calendar lifecycle requests
- When a queue is available, system emits:
  - `booking.shift.requested.external`
  - `booking.cancellation.requested.external`
- Recipient set matches the booking-created flow above.
- If no notification queue is available, lifecycle requests are still persisted, but notification dispatch is skipped.
