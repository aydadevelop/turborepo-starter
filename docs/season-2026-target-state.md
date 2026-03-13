# Season 2026 Target State

**Status:** Working document  
**Date:** 2026-03-11  
**Related:** [season-2026-product-builder-brief](./season-2026-product-builder-brief.md), [boat-rent-model-testing-matrix](./boat-rent-model-testing-matrix.md), [product-discovery-playbook](./product-discovery-playbook.md)

## Model Change We Actually Want Right Now

This is the concrete product-model target for the current phase.

We are not optimizing for a straight migration from old tools to new tools.

We are changing the operating model of the business.

The model change is:

- from a fragmented set of operational tools and external channels
- to one system that can:
  - capture demand
  - qualify and route leads
  - operate a fleet network
  - expose owner-controlled distribution
  - validate real customer journeys

### 1. Boat-rent assistant as a commercial and operational surface

We need a boat-rent assistant that is part of the business model, not a side feature.

Motivation:

- demand is competitive
- response speed matters
- many inquiries need clarification before booking
- lead quality and routing matter as much as raw traffic volume

This is not a generic AI showcase.

It should support real season work:

- gather leads
- collect contact details with consent
- answer common pre-sales questions
- qualify the request
- route to the right boat or operator
- hand off to a human when confidence is low or the booking is complex

The point is not replacement.

The point is to move toward an assisted-conversion model where the system can participate directly in demand handling.

### 2. One org panel as the operator OS

We need one organization-facing operating panel that becomes the main control layer for real-world operations.

Motivation:

- operators need one place to understand readiness, inventory, availability, pricing, and lead state
- the system has to cover the common season scenarios without code churn
- adding new categories should not force a new admin architecture each time

The org panel should let us:

- manage listings and related entities
- add new category variants from the backend
- extend models and pages without rewriting the entire admin
- configure real-world scenarios for at least `90%` of use cases

The remaining `10%` should not force code changes for every case.

Those should be handled through:

- strong admin override tools
- manual operations surfaces
- moderation/support/operator interventions

### 3. Minimal customer interface as the truth test for configuration

We need a customer-facing interface, even if it stays inside `apps/web` for now.

Motivation:

- admin settings are only useful if they produce a convincing customer journey
- we need to see how the real oRPC-backed system behaves from the traveler side
- we need a fast way to inspect whether slots, codes, pricing, availability, and trust signals actually work together

It should be good enough to:

- expose all important fields and states through the real oRPC layer
- validate how well admin configuration translates into a real customer journey
- test:
  - copy
  - codes
  - times
  - slots
  - pricing rules
  - availability behavior
  - trust signals

The point is not “build a polished consumer site first”.

The point is to create a real customer-facing truth surface for testing and learning.

### 4. Service-family extension as a first-class product rule

We should not hardcode everything around only one category.

The system needs to stay extendable to other service families while still shipping the near-season priorities.

Motivation:

- `boat_rent` is the strongest near-season surface
- `excursions` is already close enough to justify planning for it now
- the business model depends on learning and expansion, not on a one-category dead end

That means:

- shared marketplace core
- service-family-specific policies and surfaces
- no forced duplication of admin or customer flows

## Motivations

This model change is driven by four business motivations:

### 1. Demand ownership

We need more direct control over traffic, leads, and booking initiation.

### 2. Conversion quality

We need faster and more structured handling of real inquiries, especially in a competitive category.

### 3. Operator leverage

We need a system that helps owners and operators run the business with confidence during season, not a set of disconnected tools.

### 4. Category expansion

We need the product to stay extendable as new service families and variants appear.

## Near-Season Product Stack

The target stack supporting that model change is:

1. `boat-rent bot` for leads and assisted conversion
2. `org operating panel` for operators and owners
3. `minimal customer interface` for real-world booking and trust testing
4. `service-family extension model` so new categories can be added cleanly

## Priority Order

### Priority A: assisted conversion and lead handling

Reason:

- it directly improves the live commercial flow
- it creates the lead and assistant foundation for the rest of the system
- it helps us learn which inquiries can be automated, qualified, or rerouted

### Priority B: org panel for real-world operations

Reason:

- this is the system of record for owners and operators
- if this is weak, the bot and customer interface will reflect weak data and weak controls

### Priority C: minimal customer interface

Reason:

- we need a direct way to test if admin settings produce a convincing real customer flow
- this is the fastest way to validate trust, pricing, availability, and content presentation

### Priority D: service-family extension path

Reason:

- this must shape the architecture now
- but it should not block the first three priorities from shipping

## Product Rules

### Rule 1: Optimize for real workflows, not abstract completeness

If a flow is needed this season, it matters more than elegant theoretical coverage.

### Rule 2: Cover the real 90 percent with productized flows

The panel should support the common scenarios directly:

- pricing
- slots
- durations
- blocks
- calendar sync
- assets
- amenities
- publication
- lead handling

### Rule 3: Handle the last 10 percent with operator control, not code churn

For edge cases, the system should provide:

- admin overrides
- manual adjustments
- support and moderation tools
- explicit exception handling

### Rule 4: Customer surfaces must reflect admin truth

If the org panel lets an operator configure something, we must be able to inspect how it actually appears to the customer.

### Rule 5: New categories should plug into the shared operating model

New categories should add:

- policies
- variants
- fields
- presentation rules

They should not require a new product from scratch each time.

## What “Good Enough Before Season” Looks Like

### Assisted conversion layer

Good enough means:

- can collect lead intent and contact
- can answer the common pre-sales questions
- can surface or infer the right boat candidates
- can hand off cleanly to a human
- can participate safely in the core commercial path

### Org panel

Good enough means:

- operators can configure the common season scenarios without code
- owners can understand readiness and blockers
- admins can intervene when data or operations do not fit the normal path

### Customer interface

Good enough means:

- we can run real customer-path tests against the current admin configuration
- we can compare how a configured product appears to a traveler
- we can validate trust, timing, availability, and pricing from the customer side

### Extensibility

Good enough means:

- `boat_rent` is strong now
- `excursions` can be added through the same operating model with more expressive content and review/trust surfaces
- future categories do not force a rewrite of the whole panel

## Immediate Execution Program

### Wave 1: establish the assisted conversion model

Deliver:

- lead capture flow
- assistant qualification flow
- handoff to human
- basic boat recommendation and availability-aware responses

### Wave 2: Establish the operator truth

Deliver:

- org panel surfaces for the core boat-rent operating scenarios
- clear admin override and manual handling surfaces

### Wave 3: Expose the customer view

Deliver:

- minimal customer-facing pages
- enough real presentation to inspect:
  - slots
  - codes
  - pricing
  - availability
  - trust copy

### Wave 4: Add category extension points

Deliver:

- backend-driven category variants
- service-family-aware admin and customer composition
- first clean path for extending beyond boat rent

## What We Should Measure

For this target state, success is not only technical.

We should care about:

- speed to publish a working offer
- lead capture rate
- first-response speed
- booking conversion
- operator confidence
- manual rescue rate on edge cases
- time needed to add or evolve a category variant
