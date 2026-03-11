# Product Discovery Playbook

**Status:** Working document  
**Date:** 2026-03-11  
**Related:** [ADR-013](./ADR/013_backend_governed_reference_data_and_form_composition.md), [ADR-014](./ADR/014_admin_surface_composition_and_resource_descriptors.md), [real-user-test-matrix](./real-user-test-matrix.md)

## Purpose

This document defines how we study similar platforms, extract the right product patterns, and turn them into incremental features without bloating the system.

The goal is not to clone another marketplace.

The goal is to:

- find proven interaction and operations patterns
- understand what matters to demand-side and supply-side users
- translate those patterns into our own domain model, UI surfaces, and tests

## Initial Service Families

We start with two service families:

1. `excursions`
2. `boat_rent`

These are not the same as listing types.

- `service family` defines the operating model
- `listing type` defines the concrete sellable format inside that family

Examples:

- family: `excursions`
  - `walking-tour`
  - `museum-tour`
  - `bus-tour`
- family: `boat_rent`
  - `boat-charter`
  - `captained-yacht`
  - `self-drive-boat`

## Where To Look For Patterns

We should study both public buyer flows and supplier/operator flows.

### Excursions

Primary references:

- [Sputnik8](https://www.sputnik8.com/)
- [Tripster](https://experience.tripster.ru/)
- [GetYourGuide](https://www.getyourguide.com/)
- [Viator](https://www.viator.com/)
- [Klook](https://www.klook.com/)

Secondary references:

- [Tiqets](https://www.tiqets.com/)
- [TUI Musement](https://www.tuimusement.com/)

What these are good for:

- city-first discovery
- attraction/activity cards
- trust signals and review presentation
- booking flow design
- cancellation and refund expectations
- marketplace moderation and supplier quality heuristics

### Boat Rent

Primary references:

- [Click&Boat](https://www.clickandboat.com/us/)
- [Getmyboat](https://www.getmyboat.com/)
- [SamBoat](https://www.samboat.com/)

Secondary references:

- [Boatsetter](https://www.boatsetter.com/)

What these are good for:

- inventory presentation for boats and charters
- captain vs self-drive distinctions
- duration-first pricing
- deposit/prepayment patterns
- availability and calendar patterns
- owner/operator supply-side tools

## Discovery Lenses

Every platform review should be organized by the same lenses.

### Demand-side

- homepage information architecture
- search/discovery entry point
- filters and sort behavior
- list card anatomy
- listing detail page structure
- booking flow shape
- trust signals
- cancellation/refund framing
- price presentation

### Supply-side

- onboarding and first listing
- moderation and quality control
- availability/calendar controls
- pricing/ticket/discount model
- asset/photo management
- booking/order operations
- notifications and communication
- reviews and reputation handling
- commissions, payouts, reconciliation

### Platform operations

- what is self-serve vs moderated
- what is configurable vs manually reviewed
- what states are visible to the provider
- how the platform explains failures or unavailable states

## Current Pattern Notes

### Sputnik8

Observed on 2026-03-11 with Playwright.

Useful patterns:

- city-first discovery for activities
- dense, high-signal listing cards
- strong trust and purchase-friction badges
- listing detail page with content and booking widget on one page
- supplier docs organized around real operator jobs:
  - moderation
  - listing content
  - discounts
  - tickets and prices
  - calendar
  - order statuses
  - customer communication
  - statistics

Important implication for our app:

- the listing workspace should be organized by operator jobs, not by database tables

### Tripster

Observed on 2026-03-11 with Playwright.

Useful patterns:

- stronger editorial and experience-led framing on the homepage
- clearer separation between excursions, tours, and audio guides
- guide identity is much more central on the listing detail page
- listing detail pages emphasize:
  - what to expect
  - who the guide is
  - individual vs group format
  - review depth and social trust
  - question-first communication with the guide
- booking uses a separate route after the main CTA instead of keeping the full order form embedded on the detail page
- supplier help is very mature and structured around:
  - guide profile design
  - legal/organizer identity
  - moderation and publication
  - pricing setup
  - schedule/calendar
  - order operations

Important implication for our app:

- `excursions` should lean more into guide/operator identity and trust storytelling than pure inventory presentation
- for `excursions`, a question/contact path may matter almost as much as the direct booking CTA
- supplier onboarding and listing quality controls should be treated as part of the product, not only documentation

## Output Format For Each Platform Audit

Each audit should produce:

1. `Platform summary`
   - what the platform is good at
   - what service families it resembles
2. `Patterns to keep`
   - things that clearly fit our product
3. `Patterns to adapt`
   - useful ideas that need different implementation
4. `Patterns to avoid`
   - things that do not fit our scope or architecture
5. `Feature candidates`
   - specific changes to our product
6. `Test implications`
   - which user-facing tests should exist if we adopt the feature

## Decision Filter

A pattern is a good candidate only if it passes these questions:

1. Does it fit `excursions`, `boat_rent`, or both?
2. Does it improve conversion, supply quality, or operator efficiency?
3. Can we express it cleanly in our existing architecture?
4. Does it belong in:
   - shared marketplace core
   - service-family policy
   - listing-type descriptor
   - org capability
5. Can we test it with the right lane from [real-user-test-matrix](./real-user-test-matrix.md)?

If the answer is mostly “no”, we do not import the pattern.

## How Discoveries Become Features

We should not jump directly from “nice competitor pattern” to “ship it”.

Use this loop:

1. Pick one service family.
2. Review 2-4 reference platforms.
3. Extract the smallest reusable product idea.
4. Decide where it lives:
   - schema
   - backend policy
   - oRPC read model
   - frontend workspace surface
5. Write one failing user-facing test at the correct lane.
6. Implement the smallest end-to-end slice.
7. Reassess before expanding the pattern.

## Default Feature Mapping

### Shared marketplace core

These are strong candidates for shared core behavior:

- review and rating display patterns
- trust badges
- cancellation/refund state presentation
- readiness and publish gating
- moderation feedback shape
- shared order status patterns

### `excursions` family

Patterns most likely to be family-owned:

- meeting point
- guide/operator fields
- ticketed or scheduled departures
- group type and capacity
- themed route metadata

### `boat_rent` family

Patterns most likely to be family-owned:

- captain included vs self-drive
- duration-first pricing
- deposit/prepayment model
- marina/start location
- shift request or rescheduling flow
- asset-heavy listing presentation

## UI Structure We Should Aim For

The listing workspace should converge on these sections:

- `Basics`
- `Merchandising`
- `Pricing`
- `Availability`
- `Orders`
- `Compliance`
- `Publish`

Service-family policies determine which sections are visible and which fields are required.

## Examples Of Feature Candidates

### Candidate: trust badges on listing cards

Source:

- Sputnik8 excursion cards

Potential app feature:

- show badges like `no prepayment`, `tickets included`, `captain included`, `best seller`

Likely home:

- shared listing card UI + backend-composed badge read model

Test shape:

- `apps/web` Browser Mode card rendering test
- package/API test for badge derivation rules

### Candidate: provider-facing moderation feedback

Source:

- Sputnik8 supplier help and moderation docs structure

Potential app feature:

- explicit listing moderation state, rejection reasons, and readiness checklist

Likely home:

- core moderation/readiness model + listing workspace `Compliance`/`Publish` sections

Test shape:

- browser test for readiness/moderation panel
- API/package tests for state transitions

### Candidate: duration-first booking and deposit split for boats

Source:

- boat rental marketplaces

Potential app feature:

- booking UI and pricing model that prioritizes duration, deposit, and optional captain logic

Likely home:

- `boat_rent` family policy + pricing/booking surfaces

Test shape:

- package pricing tests
- Browser Mode workspace/editor tests
- hardened Playwright journey once the checkout flow stabilizes

## What Not To Do

- do not copy another platform’s UI wholesale
- do not import features without mapping them to our domain model
- do not create a new generic subsystem for every observed pattern
- do not add features only because a competitor has them
- do not skip the test decision; every adopted pattern must have a clear verification lane

## Immediate Discovery Backlog

### Excursions

1. Study `GetYourGuide` card and PDP trust/conversion patterns
2. Study `Viator` cancellation/refund framing
3. Study `Klook` filter and availability UX
4. Compare all three to `Sputnik8`

### Boat rent

1. Study `Click&Boat` owner/renter split and listing detail structure
2. Study `Getmyboat` operator and owner messaging
3. Study `SamBoat` availability and boat-type taxonomy
4. Compare all three for captain/self-drive patterns

## Delivery Rule

For each adopted discovery item:

- write down the source platform
- write down the pattern in one sentence
- write down where it belongs in our architecture
- write down the first red test
- implement only the smallest useful slice
