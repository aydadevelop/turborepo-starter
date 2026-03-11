# Role: Platform Operations And Moderation

## Mental Model

I am protecting marketplace quality and reducing risk.

I think in:

- quality thresholds
- fraud and abuse risk
- unclear or unsafe listings
- broken availability
- failed bookings
- refunds, cancellations, disputes

## Core Job To Be Done

Help me intervene when the marketplace would otherwise fail the traveler or the provider.

## Key Questions

- Why is this listing unsafe, unclear, or low quality?
- Why is this listing unavailable or overbooked?
- Which bookings need intervention?
- What should be rejected, paused, or escalated?
- What needs support, moderation, or policy action?

## Trust Triggers

- explicit moderation states
- reasoned publish blockers
- clear operational status and audit history
- reliable exception and dispute surfaces
- strong visibility into risky bookings

## Failure Triggers

- hidden moderation reasons
- weak audit trail
- no way to distinguish quality issues from technical issues
- confusing order states
- platform support forced to reverse-engineer provider intent

## Objects This User Thinks In

- listing moderation item
- rejection reason
- readiness blocker
- booking exception
- dispute
- refund/cancellation state
- provider performance signal

## Happy Path

1. Review listings awaiting moderation.
2. Explain rejection or approval clearly.
3. Monitor orders and exceptions.
4. Resolve escalations with support/provider context.
5. Protect traveler trust and provider quality.

## Playwright Exploration Missions

### Mission 1: review a listing

- Can I understand what is missing or risky without opening five pages?
- Is the moderation decision explainable?

### Mission 2: investigate a booking issue

- Can I reconstruct what happened?
- Are statuses, timestamps, and actors visible enough?

### Mission 3: protect marketplace quality

- Can I see repeated provider issues clearly?
- Do readiness and moderation surfaces point to the same truth?

## What To Inspect In Our Product

- moderation queue and listing review state
- readiness vs moderation boundaries
- booking exception and refund visibility
- auditability of important state transitions

## First Red Tests We Should Eventually Have

- moderator can approve or reject with explicit reason capture
- operations can understand booking failure state without raw DB knowledge
- readiness and moderation surfaces do not contradict each other
