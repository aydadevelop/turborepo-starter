# Architecture Gap Remediation Plan

> Status: Proposed implementation handoff
> Date: 2026-03-11
> Scope: Standalone remediation plan based on the ADR audit of the current repo state

## Current State Summary

The repo has already implemented more of the target architecture than several ADRs and the constitution document currently describe.

Confirmed live state:

- `packages/assistant` is already contract-first, with a shared `assistantContract`, contract-backed router implementation, and typed web clients.
- `packages/events` and `packages/workflows` already exist and are in active use.
- `packages/storage` already exists with provider registry, local-file and S3 adapters, startup registration, and a public asset-serving route in `apps/server`.
- Backend-governed listing type options are already exposed through `listing.listAvailableTypes` and consumed by the org listing create flow.
- ADR-014's feature-module direction has started in `apps/web/src/features/org-account`, but adoption is partial.

This means the main architecture gaps are no longer foundational package creation. The gaps are now:

1. documentation drift between ADRs and the codebase
2. incomplete frontend surface composition standardization
3. incomplete standardization of scoped resource access helpers across domain packages
4. incomplete storage write-path and asset-management flows

## Confirmed Gaps

### 1. Documentation Drift

ADR or constitution claim:

- `docs/architecture-constitution.md` still describes the assistant service as using an inline router with no shared contract and a web client typed from inferred router types.

Current code:

- `packages/assistant/src/contract.ts` defines `assistantContract`.
- `packages/assistant/src/router.ts` implements that contract.
- `apps/web/src/lib/assistant.ts` and `apps/web/src/lib/assistant.server.ts` type clients as `AssistantContractClient`.

Resolution decision:

- Treat the assistant contract-first RPC model as implemented reality.
- Update stale architecture docs in a later phase rather than creating new assistant contracts or router patterns.

Implementation owner seam:

- Documentation in `docs/`

### 2. Frontend Surface Composition Is Partial

ADR claim:

- ADR-014 establishes resource-local feature modules and thin route composition as the active frontend architecture.

Current code:

- `apps/web/src/routes/(app)/org/team/+page.svelte`, `apps/web/src/routes/(app)/org/settings/+page.svelte`, and related org-account routes are already thin wrappers over feature modules.
- Other screens still keep query state, filters, pagination, and transport logic in routes, including:
  - `apps/web/src/routes/(app)/admin/organizations/+page.svelte`
  - `apps/web/src/routes/(app)/admin/users/+page.svelte`
  - `apps/web/src/routes/(app)/org/listings/+page.svelte`
  - `apps/web/src/routes/(app)/org/listings/new/+page.svelte`
  - `apps/web/src/routes/(app)/org/listings/[id]/+page.svelte`
  - `apps/web/src/routes/(app)/org/create/+page.svelte`
  - `apps/web/src/routes/(app)/invitations/+page.svelte`

Resolution decision:

- ADR-014 is the active frontend composition direction.
- Remaining route-level screens should be migrated to resource-local feature modules instead of adding more route-owned orchestration.

Implementation owner seam:

- `apps/web`

### 3. Scoped Resource Access Is Not Yet Standardized

ADR claim:

- ADR-012 defines a stable split between actor authorization in middleware and scoped resource access in domain or repository code.
- It also calls for a repo-wide common practice instead of repeated ad hoc ownership checks.

Current code:

- Shared helpers exist in `packages/api/src/lib/db-helpers.ts`.
- Domain packages still carry repeated local ownership helpers, including:
  - `packages/booking/src/availability/availability-service.ts`
  - `packages/pricing/src/pricing-service.ts`
  - `packages/calendar/src/use-cases.ts`

Resolution decision:

- Keep actor authorization in auth plus oRPC middleware.
- Move generic scoped-access helpers out of `packages/api` into a reusable lower-layer package and migrate domain packages onto that shared surface.

Implementation owner seam:

- `packages/db` for shared helper location
- domain packages for adoption

### 4. Storage Has Read Infrastructure but Not a Product Write Path

ADR claim:

- ADR-016 calls for a full storage architecture that works across environments and the product lifecycle.

Current code:

- `packages/storage` has provider abstractions and registry functions.
- `apps/server/src/bootstrap.ts` registers the listing-public storage provider.
- `apps/server/src/routes/assets.ts` serves public assets through the registered provider.
- Catalog storefront reads already resolve public asset URLs from `listingAsset` records.
- There is no implemented end-user upload workflow, listing-asset management flow, or product UI for asset writes.

Resolution decision:

- Do not build a new provider abstraction.
- Complete the missing write path and asset-management surface on top of the existing storage foundation.

Implementation owner seam:

- `apps/server` for upload transport
- catalog or listing domain services for asset persistence and rules
- `packages/api-contract` and `packages/api` for typed management operations
- `apps/web` for asset-management UI

## Decisions Locked by This Planning Pass

The following decisions are now treated as plan inputs for future implementation work:

- The assistant service is already contract-first. No new assistant contract migration is needed.
- `packages/events`, `packages/workflows`, and `packages/storage` already exist and are not remediation targets.
- ADR-014 is the active frontend composition direction for admin and org surfaces.
- `packages/admin-zones` and `packages/field-registry` are treated as superseded by ADR-014 for this repo phase, not as pending build targets.
- Storage remediation means shipping the missing write path and asset-management behavior, not inventing a second storage abstraction.
- Existing ADR files remain unchanged in this first delivery; this document is the implementation handoff and backlog anchor.

## Phased Remediation Plan

### Phase 1: ADR and Documentation Alignment

Goal:

- Make repo-facing architecture docs match the live system.

Work:

- Update `docs/architecture-constitution.md` to reflect the current assistant, events, workflows, storage, and listing-type read-model reality.
- Add status notes to ADR-012, ADR-014, and ADR-016 so readers can see what is implemented, partial, or deferred.
- Mark ADR-001 and ADR-002 references to `packages/admin-zones` and `packages/field-registry` as superseded by ADR-014 rather than active missing work.

Acceptance criteria:

- Documentation no longer describes the assistant as contract-less.
- Documentation no longer implies `admin-zones` or `field-registry` are immediate implementation gaps.
- The current target-state narrative matches the package and app boundaries already present in the repo.

### Phase 2: Frontend Feature-Module Adoption for Remaining Ad Hoc Screens

Goal:

- Finish the transition from route-owned screen orchestration to resource-local feature modules.

Work:

- Create feature modules for the remaining ad hoc screens in `apps/web`.
- Reduce route files to composition-only wrappers where practical.
- Move transport differences between `authClient` and oRPC behind feature-local adapters.
- Add resource-local descriptors only where they remove real duplication in tables, filters, sections, or actions.

Target screens:

- admin organizations
- admin users
- org listings index
- org listing create
- org listing edit
- org create
- user invitations

Acceptance criteria:

- Target route files no longer own mutation orchestration.
- Query invalidation and transport details live in feature modules rather than in routes.
- New frontend work follows ADR-014 instead of creating more route-level orchestration.

### Phase 3: Shared Scoped-Access Helper Extraction into `@my-app/db`

Goal:

- Standardize scoped resource access across domain packages.

Work:

- Move generic ownership and scoping helpers from `packages/api/src/lib/db-helpers.ts` into `packages/db`.
- Expose a shared helper surface usable by domain packages without transport-layer imports.
- Refactor booking availability, pricing, and calendar ownership checks to use the shared helper surface.
- Preserve the split between actor authorization in middleware and row ownership in domain code.

Acceptance criteria:

- Domain packages no longer need local copies of `verifyListingOwnership` for the standard org-owned row case.
- Shared ownership helpers live below the API layer.
- Tests continue to prove foreign-org resources are rejected.

### Phase 4: Listing Asset Upload and Management Completion

Goal:

- Add a complete write path for listing assets on top of the existing storage infrastructure.

Work:

- Add a multipart upload HTTP route in `apps/server` for listing asset uploads.
- Add domain logic that verifies listing ownership, uploads through `@my-app/storage`, and persists `listingAsset`.
- Add typed API operations to list assets for a listing, set the primary asset, and delete assets.
- Add org listing UI support for uploading and managing assets.

Acceptance criteria:

- Listing assets support upload, list, set-primary, and delete flows.
- Uploaded public assets resolve through the existing `/assets/:providerId/*` route.
- Local-file and S3-backed environments use the same domain and UI flow.

## Done Means

This remediation effort is complete when:

- architecture docs no longer misdescribe the live system
- targeted route files become composition-first shells rather than owning transport orchestration
- scoped resource ownership checks use shared helpers rather than repeated package-local copies
- listing assets support upload, list, set-primary, and delete workflows end-to-end

## Non-Goals and Deferred Items

The following are explicitly out of scope for this first planning document and remain deferred:

- rewriting existing ADRs in this change
- building `packages/admin-zones`
- building `packages/field-registry`
- introducing a generic schema-driven admin generator
- replacing the existing storage provider abstraction
- redesigning the assistant architecture beyond documentation alignment
- unrelated domain-package extraction beyond the gaps confirmed in this audit
