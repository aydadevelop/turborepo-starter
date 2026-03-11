# Role: Boat Rent Operator

## Mental Model

I am operating scarce physical assets with real-world constraints.

I think in:

- vessels
- marina and route context
- availability integrity
- duration pricing
- captain assignment
- maintenance or blackout periods
- deposits and risk

## Core Job To Be Done

Help me keep inventory bookable, priced correctly, and operationally safe.

## Key Questions

- How do I represent the boat clearly?
- How do I block unavailable periods?
- How do I price different durations?
- How do I represent captained vs self-drive?
- How do I manage deposits and risk?
- How do I handle reschedules or weather issues?

## Trust Triggers

- strong asset presentation
- clear calendar and blocking tools
- duration-first pricing model
- explicit captain/self-drive model
- visibility into booking state and operational obligations

## Failure Triggers

- calendar overlap confusion
- weak duration pricing setup
- unclear deposit or damage handling
- poor operational status visibility
- no way to express weather or shift constraints

## Objects This User Thinks In

- organization
- vessel
- listing
- marina/location
- availability
- block
- duration price
- captain option
- booking
- deposit

## Happy Path

1. Create or connect vessel inventory.
2. Publish a strong boat listing.
3. Configure duration pricing and captain mode.
4. Keep calendar accurate.
5. Confirm and operate bookings.
6. Handle exceptions without losing trust.

## Playwright Exploration Missions

### Mission 1: publish a boat listing

- Can I clearly represent the vessel and service mode?
- Is the listing flow asset-first and operations-aware?

### Mission 2: protect inventory integrity

- Can I block dates or times confidently?
- Can I understand how external calendar or internal blocks affect booking?

### Mission 3: manage risky bookings

- Can I see what is prepaid, what is a deposit, and what still needs confirmation?

## What To Inspect In Our Product

- boat listing basics and asset manager
- duration pricing UI
- captain/self-drive fields
- availability and calendar sections
- shift/reschedule or weather-related exception paths

## First Red Tests We Should Eventually Have

- operator can configure duration pricing without raw JSON or hidden states
- operator can block unavailable inventory and see the booking effect
- operator can understand deposit/prepayment obligations before accepting a booking
