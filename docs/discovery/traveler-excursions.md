# Role: Traveler In Excursions

## Mental Model

I am not buying software.

I am choosing a memorable experience in a place and time I care about.

I think in:

- destination
- date or time window
- theme
- group format
- guide credibility
- convenience
- refund risk

I do not think in:

- listing schema
- metadata
- internal moderation state
- platform package boundaries

## Core Job To Be Done

Help me quickly understand:

- what this experience is
- why it is worth my time and money
- whether it fits my schedule and group
- whether I can trust the guide and the platform

## Key Decision Questions

- What exactly will happen?
- Is this private, group, or mini-group?
- Who is the guide?
- When is the next available slot?
- How long does it take?
- Where do we meet?
- Is it good for children, beginners, or first-time visitors?
- Can I cancel or reschedule?

## Trust Triggers

- review count and rating
- guide identity and story
- clear itinerary or “what to expect”
- exact meeting point
- transparent duration and group size
- clear refund/cancellation language
- recent or frequent departures

## Failure Triggers

- unclear difference between similar excursions
- no visible guide credibility
- no next available date or timing
- vague meeting point
- hidden cancellation terms
- too much internal jargon

## Objects This User Thinks In

- city
- excursion
- guide
- date/slot
- group format
- meeting point
- price
- review
- booking
- question to the guide

## Happy Path

1. Choose destination.
2. Narrow by theme/date/format.
3. Open a promising excursion.
4. Understand the guide, the route, and the format.
5. Check date, duration, and meeting point.
6. Either:
   - ask a question
   - book immediately

## Playwright Exploration Missions

### Mission 1: first-time tourist

- Can I discover a fitting excursion in under 5 minutes?
- Can I tell the difference between similar offers?
- Can I trust the guide without leaving the page?

### Mission 2: schedule-constrained buyer

- Can I quickly see availability and next departure?
- Can I tell whether this fits a morning/afternoon/evening slot?

### Mission 3: cautious buyer

- Can I understand refund and booking conditions before paying?
- Is there a clear path to ask a question before booking?

## What To Inspect In Our Product

- listing cards for theme, format, and trust
- listing detail page hierarchy
- guide/operator identity block
- booking CTA vs ask-question CTA balance
- cancellation/refund clarity
- next available slot visibility

## First Red Tests We Should Eventually Have

- traveler can distinguish private vs group excursion on the card and PDP
- traveler can see next available slot before entering checkout
- traveler can ask a question without losing booking context
