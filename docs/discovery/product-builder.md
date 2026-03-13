# Role: Product Builder

## Mental Model

I do not own only code.

I own the product shape, the speed of learning, the trust of the marketplace, and the path to making this business work.

I think in:

- customer jobs
- provider success
- conversion and trust
- readiness and operational risk
- learnings from competitors
- speed of shipping
- speed of validating ideas
- system leverage

I care about architecture because it changes:

- how fast we can test a new idea
- how safely we can ship it
- how clearly we can explain it
- how much operational debt we create

## Core Job To Be Done

Help me decide what to build next, test it quickly, and shape the system so good ideas turn into reliable product capabilities without unnecessary bloat.

## Key Questions

- Which role are we serving right now?
- Is this a real user job or just an internal feature idea?
- Does this improve trust, conversion, supply quality, or operational control?
- What is the smallest slice that proves the idea?
- What has to be backend-governed versus UI-local?
- How will this differ for `excursions` and `boat_rent`?
- What should be explored in Playwright before we commit to implementation?
- What should be tested at pure TS, browser, and full e2e levels?

## Trust Triggers

- one clear story for each role
- visible readiness and blockers
- product language instead of internal language
- easy comparison with competitor patterns
- fast feedback loops for browser and journey tests
- architecture that supports extension without rework

## Failure Triggers

- features shaped by tables instead of user jobs
- no clear role or mission for a surface
- architecture that makes every experiment expensive
- hidden dependencies between payments, listings, calendars, and moderation
- too much UI entropy for simple operational tasks
- no clear path from insight to red test to shipped capability

## Objects This User Thinks In

- role
- service family
- mission
- journey
- conversion point
- readiness blocker
- trust signal
- operational risk
- experiment
- test lane

## Happy Path

1. Start with one role and one mission.
2. Compare our current flow with one or two strong external references.
3. Identify the trust gap, conversion gap, or operational gap.
4. Define the smallest product slice that improves it.
5. Add the right red test or exploration mission.
6. Ship the smallest credible improvement.
7. Learn and iterate.

## Playwright Exploration Missions

### Mission 1: evaluate a role journey

- Can this role complete its main job without learning our internals?
- Where does trust break?

### Mission 2: compare against a reference platform

- What does the competitor make easier to understand or act on?
- Which of those patterns fit our product and service families?

### Mission 3: define a shippable experiment

- What is the smallest slice worth building next?
- What test lane should prove it first?

## What To Inspect In Our Product

- whether surfaces are grouped by user job, not table shape
- whether `excursions` and `boat_rent` are meaningfully different where they should be
- whether org onboarding, moderation, pricing, availability, and support feel like one operating system
- whether frontend flows are easy to change and validate
- whether backend boundaries help us move faster instead of slowing discovery down

## First Red Tests We Should Eventually Have

- every major new capability starts from a role, a mission, and a smallest testable slice
- every important org/operator flow has a fast browser test before it becomes a hardened e2e journey
- every new service-family capability makes its differences from the shared marketplace core explicit
