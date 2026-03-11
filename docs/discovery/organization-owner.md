# Role: Organization Owner

## Mental Model

I am not editing one listing.

I am setting up a business on the platform.

I think in:

- what services I can offer
- which teammates can manage what
- whether the business is ready to sell
- whether payments, calendars, and listings are correctly set up

## Core Job To Be Done

Help me make the organization operational and keep it under control as it grows.

## Key Questions

- What service families can this organization run?
- What do I need before I can start selling?
- Who on my team can manage listings, bookings, and support?
- Which setup steps are still incomplete?
- Why is something not publishable or bookable?

## Trust Triggers

- clear org readiness
- explicit role model
- visible setup dependencies
- predictable ownership boundaries
- no hidden platform prerequisites

## Failure Triggers

- unclear onboarding state
- setup spread across too many disconnected pages
- hidden payment/calendar dependencies
- confusing permissions
- no single source of truth for business readiness

## Objects This User Thinks In

- organization
- service family
- team/member roles
- listings
- payment setup
- calendar setup
- readiness
- moderation

## Happy Path

1. Create organization.
2. Set up payment and calendar capabilities.
3. Invite team members.
4. Create initial listings.
5. Understand readiness and publish blockers.
6. Start operating and monitoring the business.

## Playwright Exploration Missions

### Mission 1: set up a new business

- Can I understand the minimum path from org creation to first booking?
- Are dependencies and blockers visible?

### Mission 2: expand into a new service family

- Can I tell the difference between excursion setup and boat-rent setup?
- Are service-family-specific requirements explicit?

### Mission 3: manage a growing team

- Can I understand what each role can do?
- Is there a clean mental model for ownership and permissions?

## What To Inspect In Our Product

- org onboarding/readiness panel
- role and permissions model
- service-family enablement
- first-listing path
- publish blockers and setup dependencies

## First Red Tests We Should Eventually Have

- org owner can see exactly why the org is not ready to sell
- org owner can distinguish setup requirements for excursions vs boat rent
- org owner can invite the right teammate role for the right job
