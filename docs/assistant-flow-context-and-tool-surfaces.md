# Assistant Flow Context And Tool Surfaces

**Status:** Working document  
**Date:** 2026-03-12  
**Related:** [season-2026-target-state](./season-2026-target-state.md), [ADR/005-orpc_api_boundary.md](./ADR/005-orpc_api_boundary.md), [ADR/014_admin_surface_composition_and_resource_descriptors.md](./ADR/014_admin_surface_composition_and_resource_descriptors.md)

## Core Point

Generating tools from oRPC contracts is the easy part.

The hard part is giving the assistant the **right flow context** so it behaves correctly for:

- public customer journeys
- org/operator flows
- admin/manual-override flows
- support and lead-handling flows

Without that context, generated tools become a thin wrapper around APIs, not a useful product surface.

## Current Repo Truth

The current assistant already consumes the shared app contract through `context.serverClient` in:

- [packages/assistant/src/router.ts](../packages/assistant/src/router.ts)
- [packages/assistant/src/tools.ts](../packages/assistant/src/tools.ts)

But the current context is still too generic:

- [packages/assistant/src/context.ts](../packages/assistant/src/context.ts)

It has:

- model/API key
- server oRPC client
- session

It does **not** yet carry enough product context for the flows we actually care about.

## What Context We Need

We need a structured `assistant flow context` persisted or resolved per chat/session.

Suggested shape:

```ts
type AssistantFlowContext = {
  surface:
    | "public"
    | "org"
    | "admin"
    | "support"
    | "widget"
    | "telegram"
    | "avito";
  actor: {
    kind: "anonymous" | "customer" | "member" | "admin" | "operator";
    userId?: string;
    organizationId?: string;
    role?: string;
  };
  product: {
    serviceFamily?: "boat_rent" | "excursions" | string;
    listingId?: string;
    listingTypeSlug?: string;
    entityId?: string;
  };
  journey: {
    goal?:
      | "discover"
      | "qualify"
      | "quote"
      | "book"
      | "manage"
      | "support"
      | "moderate";
    startsAt?: string;
    endsAt?: string;
    date?: string;
    durationHours?: number;
    passengers?: number;
    locale?: string;
    timezone?: string;
  };
  channel: {
    source?:
      | "web"
      | "widget"
      | "telegram"
      | "avito"
      | "email"
      | "ad";
    campaign?: string;
    landingPage?: string;
  };
  capabilities: {
    canWrite?: boolean;
    canApprove?: boolean;
    canManageBookings?: boolean;
    canManageListings?: boolean;
    canUsePaymentActions?: boolean;
  };
};
```

## Why This Matters

The same tool should behave differently depending on context.

Examples:

### Public boat-rent flow

The assistant should:

- prefer discovery, availability, quote, and contact capture
- avoid dangerous write actions
- ask short conversion-oriented questions
- suggest alternative boats when unavailable

### Org/operator flow

The assistant should:

- work inside active organization scope
- understand readiness, pricing, slots, assets, and lead state
- use org-permitted write tools when appropriate
- explain blockers and next actions

### Admin/manual-override flow

The assistant should:

- expose intervention and override surfaces
- understand exceptional or edge-case workflows
- never confuse admin powers with normal org powers

## What Should Be Generated Vs Hand-Curated

### Good candidates for generation from oRPC

- read-only tools from well-described contracts
- simple mutation tools that map cleanly to one action
- capability metadata from contract tags, summaries, and schemas

### What should stay hand-curated

- tool grouping by flow
- approval policy
- system prompts
- follow-up question behavior
- fallback/handoff rules
- safety rules for sensitive writes

So the rule should be:

> generate tool primitives from oRPC, but compose assistant surfaces by flow.

## Recommended Tool Surface Model

### 1. Tool registry

One registry that maps contract procedures into tool primitives.

Examples:

- `public.read.availability.check`
- `public.read.pricing.quote`
- `org.write.listing.update`
- `org.write.pricing.createProfile`
- `admin.write.booking.override`

### 2. Flow packs

Each flow gets a curated subset of tools plus prompt rules.

Examples:

- `boat-rent-public`
- `boat-rent-operator`
- `excursions-public`
- `org-onboarding`
- `support-triage`

### 3. Context builders

A chat/session should start with a context builder depending on entry point.

Examples:

- website listing page
- widget embedded on owner site
- org dashboard
- admin console
- Telegram conversation
- Avito inbound lead

## Immediate Flows We Actually Need

### 1. Boat-rent public assistant

Goal:

- capture and qualify demand
- answer questions
- quote and route leads

Must know:

- service family = `boat_rent`
- listing/boat context when launched from a page
- date / duration / passengers when available
- channel source

### 2. Org/operator assistant

Goal:

- help an operator manage listings, pricing, availability, bookings, and leads

Must know:

- active organization
- member role
- service family
- current resource being edited or discussed

### 3. Admin/support assistant

Goal:

- help handle edge cases and interventions

Must know:

- admin/support scope
- ticket or booking context
- override capabilities

## Product Rule

Do not think of the assistant as:

- one big prompt
- one big tool list

Think of it as:

- shared tool primitives
- flow-specific context
- flow-specific policy and prompts

That is what will let the same assistant architecture support:

- public booking
- operator workflows
- admin interventions
- future service families

without collapsing into generic SaaS-chat behavior.
