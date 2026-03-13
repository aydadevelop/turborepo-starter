 # Role: Product Developer

## Mental Model

I am not just implementing tickets.

I am shaping a system that operators, travelers, and providers need to understand and trust.

I think in:

- user jobs
- domain states and transitions
- defaults and constraints
- edge cases
- observability
- testability
- maintainability

I do not want to think in:

- accidental UI duplication
- hidden business rules
- raw database terms leaking into product language
- flows that only work if I already know the system internals

## Core Job To Be Done

Help me add or improve product capabilities in a way that stays understandable, testable, and extensible.

## Key Questions

- What user role am I serving?
- What objects and states does that user think in?
- What is the smallest flow that proves this feature is real?
- Which rules belong in the backend, and which belong in the UI?
- What should be visible, editable, blocked, or automated?
- What is the first red test for this capability?
- How will this feature behave for excursions and boat rent?

## Trust Triggers

- clear domain language
- explicit statuses and transitions
- one obvious path for the common task
- test seams below the route layer
- backend-governed options and policies
- visible readiness, moderation, and failure states

## Failure Triggers

- a feature only makes sense if you know the schema
- UI generated from backend internals without product framing
- duplicated logic across routes and components
- no clear distinction between read model, mutation, and policy
- brittle browser flows with no lower-level tests
- unclear service-family differences

## Objects This User Thinks In

- role
- service family
- resource workspace
- read model
- mutation flow
- policy/defaults
- status transition
- blocker
- test case

## Happy Path

1. Start from one role and one mission.
2. Identify the user-facing objects and states.
3. Define the smallest backend-owned read model or policy surface.
4. Build the simplest workable UI flow around that model.
5. Add a pure TS test and a browser test.
6. Keep full Playwright only for the hardened end-to-end path.

## Playwright Exploration Missions

### Mission 1: understand a new capability

- Can I explain this feature in the user’s language after one session?
- What concepts are missing from the UI?

### Mission 2: validate a proposed flow

- Can the user complete the job without understanding our internals?
- Are blockers, defaults, and next actions visible?

### Mission 3: find the right test seam

- Which part belongs in pure TS tests?
- Which part needs browser tests in `apps/web`?
- Which part deserves hardened Playwright in `packages/e2e-web`?

## What To Inspect In Our Product

- whether features are organized by user job instead of table shape
- whether service-family differences are explicit
- whether forms use backend-governed options and editor state
- whether tables and workspaces expose the right operational states
- whether readiness, moderation, support, and booking surfaces align

## First Red Tests We Should Eventually Have

- developer can point to one role, one mission, and one first red test for every new capability
- browser tests cover the intended UI flow before the feature is hardened in full e2e
- no major workflow requires schema knowledge to understand the product behavior
