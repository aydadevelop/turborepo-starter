# Season 2026 Product Builder Brief

**Status:** Working document  
**Date:** 2026-03-11  
**Related:** [product-discovery-playbook](./product-discovery-playbook.md), [real-user-test-matrix](./real-user-test-matrix.md), [discovery/product-builder.md](./discovery/product-builder.md)

## Purpose

This document captures the near-season product logic for the business, not just the software architecture.

The goal is to keep the system aligned with the fastest route to:

- supply activation
- real bookings
- repeatable traffic experiments
- differentiated value for owners

## Current Strategic Truth

We are not starting from zero in all service families.

### Boat rent

- `boat_rent` already has a strong legacy foundation
- the operating model is known
- it worked through a full season last year
- the previous season already covered `40+ boats`
- calendar quality and sync are already a real wedge

This means `boat_rent` is the closest path to revenue and to a credible operator-facing product.

It also means the main challenge is no longer proving supply can exist.

The main challenge is:

- high-competition demand capture
- high-season operational reliability
- choosing the right owner and channel model fast enough

### Excursions

- `excursions` is adjacent enough to reuse much of the same marketplace core
- but it requires a more expressive listing model
- it needs stronger trust storytelling
- it needs more structured experience content
- it needs validated reviews and clearer guide identity

This means `excursions` is strategically important, but it is not the fastest same-depth launch surface as `boat_rent`.

## Product Builder View Of The System

Architecture matters because it changes how fast we can test and ship business ideas.

The system should become:

1. an operator OS for owners
2. a channel engine for traffic generation
3. a high-trust booking surface for travelers

That is more useful than thinking about the product only as a single marketplace website.

## Core Owner Models To Explore

### Model 1: Owner-first API / widget / lightweight site platform

Owners should not feel trapped inside our marketplace.

The offer:

- embeddable listing or booking widgets
- `boatsById` or grouped listing widgets
- optional payment handling:
  - with owner payment provider
  - without payment
- lightweight generated sites or landing pages
- enough customization that owners can publish quickly without building from scratch

Why this matters:

- this is a real wedge against platforms that centralize all demand and control
- it gives owners more agency
- it gives us more ways to place inventory in the market
- it creates licensing or SaaS-style revenue options, not only marketplace commission

Working hypothesis:

> We can stand out by being the best system for owner-controlled distribution, not only by being a better marketplace.

### Model 2: Demand generation network

Calendar quality alone is not enough if we do not generate sales.

The system should help create traffic, not just manage listings.

Potential channel system:

- generated grouped-experience sites
- generated niche landing pages
- widgets on partner or owner sites
- direct promotion through:
  - Avito
  - Yandex Direct
  - Telegram ads

Why this matters:

- season success depends on demand, not only on tooling quality
- the product can become a traffic-routing and booking-conversion system
- microsites and grouped pages create more testable acquisition surfaces than one central site alone

Working hypothesis:

> We need many targeted demand surfaces, not one generic marketplace destination.

### Model 3: Operator OS with strong booking integrity

Even if traffic comes from many channels, operators will stay only if the system is reliable.

The operator-facing product must remain strong in:

- calendar sync and availability integrity
- multi-channel distribution
- booking clarity
- payments and deposits
- support and exception handling
- readiness and moderation visibility

Working hypothesis:

> The backend and architecture matter because they make multi-channel selling and reliable operations possible without chaos.

## What This Means For Service Families

### Boat rent

Primary near-season wedge:

- superior calendar and availability model
- owner-controlled distribution
- duration-first pricing
- clear deposit / captain / self-drive presentation

Primary near-season bottleneck:

- high traffic and high competition require stronger demand capture and conversion, not only better tooling

Current strategic advantage:

- real operating expertise from the previous season
- real supply density, not hypothetical marketplace inventory
- existing knowledge of live-season failure modes

Near-season role priority:

1. boat rent operator
2. traveler in boat rent
3. organization owner

### Excursions

Primary near-season wedge:

- richer, more trustworthy experience pages
- guide identity and credibility
- validated reviews
- grouped editorial surfaces and city/theme pages

Near-season role priority:

1. excursion provider / guide
2. traveler in excursions
3. platform moderation

## Product Shape We Actually Need

We should think of the system as four connected layers:

1. **Core commerce and operations**
   - listings
   - pricing
   - availability
   - bookings
   - payments
   - support

2. **Owner operating system**
   - org onboarding
   - team roles
   - readiness
   - moderation
   - channel setup

3. **Distribution surfaces**
   - main marketplace
   - generated sites
   - widgets
   - grouped landing pages
   - paid acquisition targets

4. **Trust surfaces**
   - expressive listing pages
   - validated reviews
   - guide/operator identity
   - cancellation clarity
   - location and operational confidence

## Near-Season Constraints

We have only a few months before season starts.

That changes the standard:

- do not chase perfect abstraction forever
- finish the abstractions that unblock speed and reliability
- then bias toward experiments that can produce bookings or prove a distribution model

The main risk is not only bad code.

The main risk is spending the season with a clean architecture and weak traffic or weak operator adoption.

## Decision Rules For The Next Few Months

We should favor work that does at least one of these:

- helps owners publish faster
- helps owners distribute inventory beyond our main site
- improves traveler trust enough to lift conversion
- creates a new testable demand surface
- reduces operational risk in live season flows

We should de-prioritize work that:

- improves elegance but not shipping speed
- adds abstraction without opening a new testable product move
- creates UI complexity without clearer owner or traveler value

## Discovery And Playwright Use

Every new exploration should be anchored in:

1. one role
2. one service family
3. one business model or channel hypothesis
4. one user mission

Examples:

- `boat_rent operator` + `owner-controlled widget setup`
- `traveler in boat rent` + `Telegram ad landing page`
- `excursion traveler` + `city landing page with validated reviews`
- `organization owner` + `first channel activation`

## Immediate Strategic Questions

These are the highest-value questions to answer next:

1. What is the smallest owner-controlled distribution product we can launch before season?
2. What is the smallest grouped landing page system we can use to test paid traffic?
3. What boat-rent traveler flow most increases trust and booking completion?
4. What excursion listing page elements are mandatory before we can compete credibly?
5. Which parts of the operator OS are truly required before we scale traffic?
6. Which owner model best fits our existing `40+ boat` network under current season pressure?

## Output We Want From Future Sessions

When we explore or prototype next, the output should be:

1. role
2. service family
3. owner model or channel hypothesis
4. trust or conversion problem
5. smallest shippable experiment
6. test lane:
   - pure TS
   - browser
   - hardened Playwright
7. expected business learning
