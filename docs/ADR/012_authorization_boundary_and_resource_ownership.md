# ADR-012: Authorization Boundary and Scoped Resource Access

**Date:** 2026-03-11
**Status:** Proposed
**Authors:** Platform Team
**Related:** [ADR-002: Architecture Patterns](./002_architecture-patterns.md), [ADR-005: oRPC API Boundary](./005-orpc_api_boundary.md), [ADR-011: Organization Overlay and Readiness Projection](./011_organization_overlay_and_readiness_projection.md)

---

## Context

The repo already has a transport-level authorization chain:

`publicProcedure` -> `sessionProcedure` -> `protectedProcedure` -> `organizationProcedure` -> `organizationPermissionProcedure`

That chain is correct and should stay.

It answers:

- who the actor is
- whether the actor is authenticated
- whether the actor has an active organization membership
- whether the actor's role is allowed to attempt an operation class

In this repo, that actor/org access layer is powered by Better Auth organization membership plus local permission mapping:

- Better Auth organization plugin in [`packages/auth/src/index.ts`](../../packages/auth/src/index.ts)
- role and permission definitions in [`packages/auth/src/organization-access.ts`](../../packages/auth/src/organization-access.ts)
- active membership resolution in [`packages/api/src/context.ts`](../../packages/api/src/context.ts)
- middleware narrowing in [`packages/api/src/index.ts`](../../packages/api/src/index.ts)

However, actor authorization is not the same thing as resource access.

The middleware chain does **not** answer:

- does this `listingId` belong to the active organization
- does this `ticketId` belong to the active organization
- does this `chatId` belong to the current user
- does this child row belong to a parent resource owned by the current org

The codebase already reflects that distinction, but not consistently:

- some domains scope resources correctly in service or repository code, such as:
  - [`packages/booking/src/booking-service.ts`](../../packages/booking/src/booking-service.ts)
  - [`packages/support/src/tickets/service.ts`](../../packages/support/src/tickets/service.ts)
  - [`packages/support/src/tickets/repository.ts`](../../packages/support/src/tickets/repository.ts)
  - [`packages/assistant/src/router.ts`](../../packages/assistant/src/router.ts)
- some repeated checks are implemented ad hoc, such as local `verifyListingOwnership(...)` helpers in:
  - [`packages/booking/src/availability/availability-service.ts`](../../packages/booking/src/availability/availability-service.ts)
  - [`packages/pricing/src/pricing-service.ts`](../../packages/pricing/src/pricing-service.ts)
  - [`packages/calendar/src/use-cases.ts`](../../packages/calendar/src/use-cases.ts)
- some generic ownership helpers exist, but only in transport code:
  - [`packages/api/src/lib/db-helpers.ts`](../../packages/api/src/lib/db-helpers.ts)

The problem is not one helper name. The problem is the lack of a repo-wide common practice for scoped access and ownership checks.

This ADR defines that practice.

---

## Decision

We standardize access checks into two layers with clear responsibilities:

1. **Actor authorization**
2. **Scoped resource access**

These layers are complementary and must not be collapsed into one abstraction.

### 1. Actor authorization belongs to auth + middleware

The canonical source of truth for actor/org access is:

- Better Auth session
- Better Auth organization membership
- Better Auth active organization state
- repo-defined organization roles and permission statements
- oRPC middleware narrowing

This layer decides whether an actor may attempt:

- `listing:update`
- `pricing:create`
- `availability:read`
- `support:update`

This layer does **not** decide whether a concrete row identified by request input is owned by that actor or organization.

### 2. Scoped resource access belongs to domain/repository code

The canonical source of truth for concrete row access is the owning domain package and its repository/data-access helpers.

For any read or mutation that uses resource IDs from input, the domain must enforce scope in one of the standard patterns below.

This rule applies even if transport middleware also performs an early check.

---

## Standard Access Patterns

Every new endpoint or domain mutation should fit one of these patterns.

### Pattern A: Actor-gated operation

Use this when the operation is not about a pre-existing owned row.

Examples:

- create organization-scoped resource
- create booking from public storefront
- invite member

Guard:

- middleware only

Typical inputs:

- org context from active membership
- actor user ID from session

### Pattern B: Direct organization-owned resource

Use this when the row itself carries `organizationId`.

Examples:

- `booking.id + booking.organizationId`
- `supportTicket.id + supportTicket.organizationId`
- `listing.id + listing.organizationId`

Rule:

- queries and mutations must scope by both the resource ID and `organizationId`

Preferred forms:

- single-query scope: `where(id = ? and organization_id = ?)`
- domain helper: `findXForOrganization(...)` / `requireXForOrganization(...)`

### Pattern C: Direct user-owned resource

Use this when the row itself carries `userId` or `customerUserId`.

Examples:

- `assistantChat.id + assistantChat.userId`
- customer-owned support thread
- customer-owned booking list

Rule:

- queries and mutations must scope by both the resource ID and the user scope key

Preferred forms:

- `findXForUser(...)`
- `requireXForUser(...)`
- `listXForUser(...)`

### Pattern D: Parent-owned or indirect resource

Use this when the child row does not carry the full access scope directly, or the real owner is a parent row.

Examples:

- availability rule belongs to listing
- pricing rule belongs to listing
- calendar connection belongs to listing or organization
- nested child resources under ticket, booking, or listing

Rule:

- scope must be enforced through the authoritative parent relation

Preferred forms:

- join query that checks parent scope in one statement
- load child -> resolve parent scope -> require parent ownership
- domain helper like `requireListingForOrganization(...)` used by child-resource mutations

### Pattern E: Scoped list query

Use this when listing multiple rows in a tenant or user scope.

Examples:

- list org bookings
- list org tickets
- list my chats
- list my tickets

Rule:

- the root query predicate must include the scope key
- never fetch a broad set and filter in memory

Preferred forms:

- `listXForOrganization(...)`
- `listXForUser(...)`

---

## Common Practice

The repo-wide common practice is:

1. Middleware answers actor and role questions.
2. Domain/repository code answers concrete row-access questions.
3. Shared access helpers live below transport.
4. New code uses standard helper naming instead of ad hoc `verify*` helpers.

This means developers should stop inventing one-off patterns such as:

- `verifyListingOwnership`
- `assertOrgOwnsThing`
- inline duplicate `(id, organizationId)` lookups scattered per package
- transport-only ownership checks with no domain enforcement

Instead, each access check should resolve to one of the standard patterns and use canonical helper names.

---

## Helper Placement

### `packages/api`

Allowed:

- auth middleware
- permission middleware
- transport-only error mapping
- optional route-level convenience middleware

Not allowed:

- becoming the canonical source of row ownership helpers used by domain packages

### `packages/db`

Owns:

- query-only shared access helpers that many domain packages can reuse

Target location:

- `packages/db/src/access/`

This package is the right home because:

- every domain package already depends on `@my-app/db`
- the helpers are query-only
- it avoids transport-to-domain dependency inversion

### Owning domain package

Owns:

- higher-level access wrappers when the access rule is domain-specific
- helpers that combine row access with business invariants

Examples:

- `requireTicketForOrganization(...)`
- `requireTicketForCustomer(...)`
- `assertBookingTransitionAllowed(...)`

### Guideline

Prefer small, typed, scope-specific helpers over one giant generic metaprogramming helper.

Good:

- `findListingForOrganization`
- `requireListingForOrganization`
- `findTicketForCustomer`
- `requireTicketForOrganization`

Risky:

- a single abstraction that tries to encode every ownership shape in the repo

---

## Naming Rules

Use names that describe both the resource and the scope.

Preferred:

- `findXForOrganization`
- `requireXForOrganization`
- `listXForOrganization`
- `findXForUser`
- `requireXForUser`
- `listXForUser`

Use `assert*` only for business invariants that are not simple row retrieval.

Avoid:

- `verifyXOwnership`
- `checkXAccess`
- `validateXPermission`

unless the helper is truly broader than a scoped lookup.

---

## Error Semantics

### Actor-level failures

Use:

- `UNAUTHORIZED`
- `FORBIDDEN`

Examples:

- no session
- no active organization
- role lacks permission to attempt the operation

### Resource-scope failures

Use:

- `NOT_FOUND` by default for org/user ownership mismatch

This covers both:

- resource does not exist
- resource exists but is outside the caller's scope

This matches existing repo behavior and tests for managed resources.

### Business-rule failures

Use domain-specific errors mapped at the transport boundary.

Examples:

- invalid transition
- duplicate request
- slot unavailable

---

## Better Auth's Role in This Design

Better Auth **does** properly handle the organization access layer in this repo.

It is the correct source of truth for:

- session identity
- membership
- active organization
- org role
- permission matrix
- organization/member/invitation/team lifecycle

It is **not** the correct source of truth for arbitrary marketplace row ownership.

Better Auth can answer:

- "Can this member with role `manager` update listings in this organization?"

It cannot by itself answer:

- "Does `listingId = X` in our marketplace schema belong to this organization?"

That second question depends on domain tables and must remain in scoped domain/data access.

---

## External Precedent

### Medusa

Medusa uses middleware for actor authentication and `auth_context.actor_id`, then scopes concrete resources in the route or workflow input.

Relevant examples:

- protected route middleware with `authenticate(...)` in [protected-routes docs](https://github.com/medusajs/medusa/blob/develop/www/apps/book/app/learn/fundamentals/api-routes/protected-routes/page.mdx#L120-L240)
- actor-specific route creation in [create actor type docs](https://github.com/medusajs/medusa/blob/develop/www/apps/resources/app/commerce-modules/auth/create-actor-type/page.mdx#L127-L229)
- customer self-scope in [`store/customers/me`](https://github.com/medusajs/medusa/blob/develop/packages/medusa/src/api/store/customers/me/route.ts#L14-L52)
- workflow input scoped by authenticated customer in [`store/orders/[id]/transfer/request`](https://github.com/medusajs/medusa/blob/develop/packages/medusa/src/api/store/orders/%5Bid%5D/transfer/request/route.ts#L11-L38)
- direct object-level ownership check in [`admin/views/[entity]/configurations/[id]`](https://github.com/medusajs/medusa/blob/develop/packages/medusa/src/api/admin/views/%5Bentity%5D/configurations/%5Bid%5D/route.ts#L14-L104)

The pattern is the same as this ADR:

- middleware authenticates the actor
- handler/service/workflow scopes the concrete resource

### Mercur

Mercur adds reusable ownership middleware for marketplace route families:

- [`check-ownership.ts`](https://github.com/mercurjs/mercur/blob/main/packages/modules/b2c-core/src/shared/infra/http/middlewares/check-ownership.ts#L22-L160)
- [`filter-by-seller-id.ts`](https://github.com/mercurjs/mercur/blob/main/packages/modules/b2c-core/src/shared/infra/http/middlewares/filter-by-seller-id.ts#L7-L20)

It applies those middlewares broadly:

- vendor products in [`products/middlewares.ts`](https://github.com/mercurjs/mercur/blob/main/packages/modules/b2c-core/src/api/vendor/products/middlewares.ts#L46-L259)
- vendor promotions in [`promotions/middlewares.ts`](https://github.com/mercurjs/mercur/blob/main/packages/modules/b2c-core/src/api/vendor/promotions/middlewares.ts#L25-L126)

But Mercur still passes seller/actor scope into route logic and workflows:

- [`vendor/products/[id]/route.ts`](https://github.com/mercurjs/mercur/blob/main/packages/modules/b2c-core/src/api/vendor/products/%5Bid%5D/route.ts#L115-L164)
- [`vendor/promotions/[id]/route.ts`](https://github.com/mercurjs/mercur/blob/main/packages/modules/b2c-core/src/api/vendor/promotions/%5Bid%5D/route.ts#L147-L180)

So even Mercur's stronger use of middleware does not justify transport-only ownership enforcement.

---

## Hard Rules

- Better Auth and middleware own actor/org/role authorization.
- Domain and repository code own concrete row access.
- Route-level ownership middleware is optional convenience, not the only guard.
- Domain packages must not depend on `packages/api` for shared access helpers.
- Shared query-only access helpers belong in `packages/db`.
- List queries must include scope predicates in SQL, not in-memory filtering.
- Wrong-tenant access to an org-scoped or user-scoped resource returns `NOT_FOUND` by default.
- Prefer resource-and-scope helper names over ad hoc `verify*` helper names.

---

## Proposed Implementation Direction

### Phase 1: Create a shared access package under `@my-app/db`

Target:

- `packages/db/src/access/`

Initial contents:

- low-level query-only ownership helpers that are reused by more than one domain
- first repeated extraction: listing/org access

### Phase 2: Establish canonical wrappers in repeated domains

Refactor repeated ad hoc ownership helpers to the shared pattern.

`verifyListingOwnership(...)` is only one candidate for replacement, not the subject of the ADR.

Other repeated patterns should be migrated the same way as they appear.

### Phase 3: Keep `packages/api` focused on transport

Revisit [`packages/api/src/lib/db-helpers.ts`](../../packages/api/src/lib/db-helpers.ts) and split it along the boundary:

- transport-only helpers stay in `packages/api`
- reusable access helpers move down to `packages/db`

### Phase 4: Add route convenience only where it helps materially

If a route family repeats the same pre-check many times, add API-level middleware or helper there.

That convenience must delegate to the same canonical scoped-access helpers and must not replace domain enforcement.

---

## Consequences

### Positive

- gives the repo a repeatable access practice instead of per-package reinvention
- keeps Better Auth in the role it handles well
- keeps row ownership with the domain tables that actually define ownership
- avoids transport-layer dependencies leaking into domain packages
- supports both Medusa-style actor scoping and Mercur-style route ergonomics

### Costs

- requires refactoring some existing ad hoc access helpers
- introduces a new shared helper surface in `packages/db`
- requires discipline to avoid over-generalizing the access helper layer

### Rejected Alternatives

**Put all ownership into the auth/access schema.**

Rejected because:

- auth middleware can only protect HTTP entrypoints
- domain services are also called from workflows, jobs, and tests
- Better Auth knows membership and permissions, not arbitrary marketplace row ownership
- this would move data-access rules upward into transport

**Keep handling ownership ad hoc in each package.**

Rejected because:

- repeated patterns are already diverging
- helper naming is inconsistent
- shared practice is needed to keep new code coherent

