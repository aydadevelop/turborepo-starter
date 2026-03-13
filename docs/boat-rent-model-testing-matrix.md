# Boat Rent Model Testing Matrix

**Status:** Working document  
**Date:** 2026-03-11  
**Related:** [season-2026-product-builder-brief](./season-2026-product-builder-brief.md), [product-discovery-playbook](./product-discovery-playbook.md), [real-user-test-matrix](./real-user-test-matrix.md)

## Purpose

`boat_rent` is not a greenfield idea for this business.

It already operated through a previous season with `40+ boats`.

That changes the job:

- we do not need to prove that supply can exist
- we need to find the best operating and demand model for the next season
- we need to test models fast enough to matter before season starts

This document is for comparing those models without drifting into random feature work.

## Current Truth

`boat_rent` is both:

- our strongest near-term commercial opportunity
- our strongest operational risk surface

Why:

- demand is competitive
- traffic is expensive
- season pressure is real
- owners need reliability, not only software polish
- one weak booking or calendar experience can waste high-intent traffic

So the goal is not “build more boat-rent features”.

The goal is:

> find the best model for winning demand, converting it, and operating it with confidence.

## Model Candidates

### Model A: Core marketplace first

Description:

- concentrate demand on the main marketplace site
- owners and boats primarily live inside the platform
- platform pages do most of the selling

Strengths:

- easiest brand concentration
- simpler analytics story
- fewer distribution surfaces to manage

Weaknesses:

- competes head-on with larger marketplaces
- owners may feel locked in
- slower to test niche or local acquisition angles

Best fit if:

- centralized brand traffic becomes strong enough
- marketplace trust and conversion outperform channel fragmentation

### Model B: Owner-controlled distribution OS

Description:

- provide widgets, small sites, or listing blocks for owners
- optional owner payment provider
- platform becomes the operating system behind many owner-controlled surfaces

Strengths:

- stronger owner value proposition
- easier differentiation from centralized marketplaces
- enables SaaS or license-style monetization

Weaknesses:

- more fragmented traffic and attribution
- requires cleaner channel and embed tooling
- needs stronger setup UX for owners

Best fit if:

- owners care strongly about control
- the local network already trusts us operationally
- we can ship a very small but strong first distribution product

### Model C: Demand generation network

Description:

- create many targeted acquisition surfaces:
  - marina pages
  - city pages
  - grouped fleet pages
  - ad-specific landing pages
  - Telegram / Avito / Yandex Direct targets

Strengths:

- better fit for high-competition demand capture
- many smaller experiments instead of one homepage bet
- easier to align landing pages with local intent

Weaknesses:

- more content and experiment management
- requires strong lead routing and attribution
- can create operator chaos if fulfillment is weak

Best fit if:

- we accept that traffic must be won page by page and channel by channel
- we can keep routing and availability integrity strong

### Model D: Assisted inquiry and concierge conversion

Description:

- focus on lead capture and qualification first
- assistant responds fast
- booking is guided instead of fully self-serve in every case

Strengths:

- reduces friction for complex or high-consideration bookings
- uses our operational expertise as an advantage
- can increase conversion when users need reassurance

Weaknesses:

- higher operational load
- slower to scale if too human-dependent
- requires strong inbox, qualification, and handoff

Best fit if:

- many bookings still need clarification
- captain, weather, departure, or deposit questions block checkout

### Model E: Fleet network and rerouting engine

Description:

- treat the system as a shared local fleet network
- if one boat is unavailable, reroute to another trusted boat
- expand through friends and local neighbors

Strengths:

- uses the existing `40+ boat` base well
- turns availability depth into conversion advantage
- supports better fill rate during peak season

Weaknesses:

- requires strong cross-boat matching and ownership logic
- operator trust and payout clarity become more important
- can get messy if inventory quality is uneven

Best fit if:

- supply quality is already reasonably trusted
- missed bookings from local unavailability are a real problem

## Working Recommendation

The likely best near-season shape is not one model in isolation.

It is a combined stack:

1. `Operator OS` remains the foundation
2. `Demand generation network` drives traffic
3. `Assisted inquiry / concierge` improves conversion
4. `Fleet rerouting` increases fill rate
5. `Owner-controlled distribution` becomes the medium-term wedge

This implies:

- do not bet only on one central marketplace
- do not bet only on software licensing
- do not bet only on AI automation

Use the current boat-rent strength to test a layered system.

## What We Need To Learn Fast

Before season, the highest-value unknowns are:

1. Which landing-page shapes convert best for local boat demand?
2. Which inquiries require assistant + human reassurance rather than direct checkout?
3. How much value do owners place on direct distribution control?
4. How often can we save a lost booking by rerouting to another boat?
5. Which acquisition channels produce leads we can actually close?

## Experiment Types

### Experiment 1: Single-boat landing page

Goal:

- test direct conversion for one known strong boat

Measure:

- inquiry rate
- booking rate
- contact capture rate
- assistant engagement rate

### Experiment 2: Marina or area fleet page

Goal:

- test grouped local demand and rerouting behavior

Measure:

- click-through to boats
- inquiry to booking conversion
- rescue rate when first boat is unavailable

### Experiment 3: Owner widget

Goal:

- test whether owner-controlled placement creates real value

Measure:

- setup friction
- owner adoption
- lead quality
- repeated use

### Experiment 4: Assistant-led inquiry flow

Goal:

- test whether fast structured reply improves conversion

Measure:

- first-response time
- qualified lead rate
- handoff rate
- booking conversion from assisted leads

### Experiment 5: Paid acquisition by angle

Goal:

- compare traffic sources and landing-page angles

Possible angles:

- captained boat
- self-drive
- party/group
- fishing
- romantic/sunset
- marina-specific

Measure:

- cost per lead
- cost per qualified lead
- cost per booking

## Decision Criteria

A model is good if it improves at least two of:

- direct demand ownership
- booking conversion
- fleet utilization
- owner retention
- expansion to partner boats
- operational confidence during season

A model is weak if it creates more complexity than learning or revenue.

## How To Use This In Discovery

Each Playwright or product session should record:

1. model candidate
2. role
3. mission
4. hypothesis
5. trust or conversion blocker
6. smallest shippable slice
7. test lane
8. success metric

## Immediate Priority Order

1. single-boat and grouped-boat landing pages
2. assistant-led inquiry capture
3. rerouting across nearby boats
4. owner-controlled widget or mini-site
5. deeper owner payment/provider flexibility
