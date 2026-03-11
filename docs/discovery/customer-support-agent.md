# Role: Customer Support Agent

## Mental Model

I am not selling and I am not configuring the marketplace.

I am resolving uncertainty, failure, and exceptions for real people.

I think in:

- conversation history
- booking context
- urgency
- who needs an answer next
- whether this is a provider issue, traveler issue, or platform issue

## Core Job To Be Done

Help me understand the issue fast and move it toward resolution without losing context.

## Key Questions

- What booking or listing is this about?
- What has already happened?
- Who is waiting on whom?
- Is this a refund, reschedule, dispute, or simple clarification?
- What is the next best action?

## Trust Triggers

- unified thread view
- clear booking/listing context
- visible internal notes vs customer-visible replies
- clear owner/assignee
- understandable ticket status

## Failure Triggers

- conversation detached from booking context
- no ownership or assignment clarity
- platform support forced to hunt across multiple screens
- no distinction between internal notes and public replies

## Objects This User Thinks In

- ticket
- message thread
- booking context
- customer
- provider
- assignee
- next action

## Happy Path

1. Open a ticket.
2. See the booking or listing context immediately.
3. Understand message history and current owner.
4. Reply, escalate, or assign.
5. Close or follow up when resolved.

## Playwright Exploration Missions

### Mission 1: respond to a simple traveler question

- Can I answer without leaving the support thread?

### Mission 2: resolve a booking exception

- Can I see the operational context and message history together?

### Mission 3: coordinate internally

- Can I add internal notes, reassign, and track status cleanly?

## What To Inspect In Our Product

- support thread visibility
- booking-linked ticket context
- assignment and status flows
- internal note vs public message separation

## First Red Tests We Should Eventually Have

- agent can open a thread and immediately see booking context
- internal notes stay internal while public replies remain customer-visible
- agent can assign and progress a ticket without leaving the support surface
