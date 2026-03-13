# Functionality Matrix

**Status:** Working document  
**Date:** 2026-03-12  
**Related:** [Real-User Test Matrix](./real-user-test-matrix.md), [Architecture Gap Remediation Plan](./architecture-gap-remediation-plan.md), [Season 2026 Target State](./season-2026-target-state.md), [ADR-011](./ADR/011_organization_overlay_and_readiness_projection.md), [ADR-014](./ADR/014_admin_surface_composition_and_resource_descriptors.md)

## Purpose

This matrix tracks the current product capability shape across:

- service families
- roles
- backend owners
- current surface status
- verification lane

It is intentionally grounded in the live repo, not in target-state package names alone.

The point is to answer two questions clearly:

1. what already works as a real product slice
2. what is still only a partial abstraction, summary surface, or backend-only seam

## Status Legend

- `Implemented`: usable current slice with a real backend owner and at least one meaningful verification lane
- `Partial`: real backend or UI work exists, but the operator/customer workflow is still incomplete, read-only, or thin
- `Missing`: not yet a real product surface
- `Deferred`: intentionally postponed until a stronger preceding seam exists

## Verification Lanes

- `L1`: package or API Vitest integration
- `L2`: `apps/web` Vitest Browser Mode
- `L3`: hardened Playwright in `packages/e2e-web`
- `Manual`: runbook or opt-in real-provider check

## Cross-Family Foundation

| Role | Capability | Status | Backend owner | Primary surface | Verification | Notes |
|---|---|---|---|---|---|---|
| operator | org settings, team, invitations, switching | Implemented | `auth`, `apps/web` feature modules | `org-account` feature screens | `L2`, `L3` | Good baseline for auth-owned org operations |
| operator | organization overlay summary | Implemented | `packages/organization` | org listings overlay panel | `L1`, `L2` | Readiness and publishing summary are real |
| operator/admin | manual overrides | Implemented | `packages/organization` | org listings overlay panel | `L1`, `L2` | Create/resolve flow exists |
| operator/admin | moderation actions and audit trail | Implemented | `packages/organization` | overlay panel + listing publish section | `L1`, `L2` | Approve/clear + audit note/timeline exist |
| operator/admin | distribution actions | Partial | `packages/organization`, `packages/catalog` | overlay panel | `L1`, `L2` | Publish/unpublish exists, but channel management is still thin |
| operator | support tickets and messages | Implemented | `packages/support` | support routes and handlers | `L1` | Domain foundation is good; operator summary surface is still light |
| support | inbound processing and ticket routing | Implemented | `packages/support` | backend workflow only | `L1` | Strong backend seam, limited dedicated UI |
| assistant | flow-specific tool surfaces | Missing | `packages/assistant` | none | `L0` only | Tools exist, but flow context and role packs are not yet integrated into product surfaces |
| operator | account-first calendar model | Implemented | `packages/calendar` | listing workspace calendar section | `L1`, `L2` | `organization_calendar_account` and `organization_calendar_source` are live |
| operator | real provider lifecycle verification | Partial | `packages/calendar`, `apps/server` | runbook + opt-in seed profile | `L1`, `Manual` | Integration model exists, but real-provider execution is still manual |
| admin/operator | cross-capability dashboard beyond listings | Partial | `packages/organization` | org listings overlay panel | `L1`, `L2` | Overlay is real, but still listing-centric |

## `boat_rent` Family

### Operator Surface

| Capability | Status | Backend owner | Primary surface | Verification | Notes |
|---|---|---|---|---|---|
| family-aware basics and typed boat profile | Implemented | `packages/catalog` | listing create/edit + workspace basics | `L1`, `L2`, `L3` smoke | First fully modeled family slice |
| pricing workspace state | Partial | `packages/pricing` | listing workspace pricing tab | `L1`, `L2` | Read model exists; full operator editing flow is not yet finished |
| promotions / discount preview model | Partial | `packages/promotions`, `packages/booking` | booking surface + backend services | `L1`, `L2` | Public preview exists; operator management UI is still missing |
| availability workspace state | Partial | `packages/booking` | listing workspace availability tab | `L1`, `L2` | Read model exists; editor-grade operator controls are still incomplete |
| calendar connect / discover / attach | Partial | `packages/calendar` | listing workspace calendar tab | `L1`, `L2`, `Manual` | Account-first flow exists; detach, richer sync controls, and live-provider checks remain |
| assets/media workspace | Partial | `packages/catalog`, `packages/storage` | listing workspace assets tab | `L1`, `L2` | Read model exists; upload and write management are still a major gap |
| publish/readiness and moderation | Partial | `packages/organization`, `packages/catalog` | overlay panel + workspace publish tab | `L1`, `L2` | Usable now, but still thinner than a full operator launch workflow |
| payment / booking operations | Partial | `packages/booking`, `packages/payment` | booking APIs, no full operator UI | `L1` | Core services exist; operator-facing payment and reschedule tooling are thin |

### Customer Surface

| Capability | Status | Backend owner | Primary surface | Verification | Notes |
|---|---|---|---|---|---|
| listing browse cards | Implemented | `packages/catalog` | `/listings` | `L1`, `L3` smoke | Family-aware summary is real |
| listing detail truth surface | Implemented | `packages/catalog` | `/listings/[id]` | `L1`, `L3` smoke | Boat facts render from typed backend summary |
| composed booking surface | Implemented | `packages/booking` | `BoatRentBookingSurfacePanel` | `L1`, `L2` | Slots, pricing, blocks, min-duration, and discount preview are composed in one read model |
| booking request creation | Partial | `packages/booking` | booking surface panel | `L1`, `L2` | Request path exists; broader reservation/checkout experience is still thin |
| payment / checkout completion | Partial | `packages/payment`, `packages/booking` | backend only | `L1`, `L3` | Payment lifecycle exists, but customer funnel is not yet a polished booking/checkout flow |

## `excursions` Family

### Operator Surface

| Capability | Status | Backend owner | Primary surface | Verification | Notes |
|---|---|---|---|---|---|
| typed excursion profile | Implemented | `packages/catalog` | listing create/edit + workspace basics | `L1`, `L2` | Second family proves the abstraction is not boat-specific |
| pricing / availability / assets / calendar sections | Partial | shared commerce packages | listing workspace shared tabs | `L1`, `L2` | Shared sections exist, but they are not yet excursion-shaped beyond profile basics |
| moderation / publication readiness | Partial | `packages/organization`, `packages/catalog` | shared overlay/workspace surfaces | `L1`, `L2` | Works at the shared layer; excursion-specific readiness is still thin |
| guide-facing assignment / trust model | Missing | `packages/catalog`, `packages/db` staffing overlay later | none | none | Member assignment exists operationally, but not as a public guide/trust model |

### Customer Surface

| Capability | Status | Backend owner | Primary surface | Verification | Notes |
|---|---|---|---|---|---|
| listing browse and detail | Implemented | `packages/catalog` | `/listings`, `/listings/[id]` | `L1`, `L3` smoke | Experience-first summary exists |
| excursion booking/request surface | Partial | `packages/pricing`, `packages/booking`, `packages/availability` | generic `BookingRequestPanel` | `L1`, `L2` | Works as a thin truth surface, but not yet schedule-led or excursion-specific |
| validated reviews / trust layer | Missing | future `catalog` / review overlay | none | none | The family model anticipates it, but the product surface is not built yet |
| guide identity and storytelling | Missing | future overlay on member/staffing | none | none | Major product differentiator still absent |

## Current High-Signal Findings

### 1. The backbone is now real

The repo now has the key Medusa-like seams in place:

- isolated domain packages
- overlay state in `packages/organization`
- service-family policy in `packages/catalog`
- tailored read models for operator and customer surfaces
- workflow ownership for at least publication and calendar-side booking lifecycle reactions

This is no longer a generic marketplace skeleton.

### 2. `boat_rent` is the strongest end-to-end family

`boat_rent` currently has the best full chain:

- typed operator model
- minimal customer truth surface
- composed booking surface
- discount preview
- query-budget verification
- seeded smoke coverage

It is the right family to keep using as the operational benchmark.

### 3. The operator OS is still more read-oriented than write-complete

The listing workspace now proves the structure, but most sections beyond basics remain:

- summary views
- attachment flows
- or thin action surfaces

The biggest remaining operator gap is not another package. It is finishing write paths for:

- pricing
- availability
- assets/media
- richer calendar controls

### 4. `excursions` proves the abstraction, but not the product yet

The family layer supports `excursions`, but only at the profile and presentation level.

The missing excursion-specific layer is still:

- schedule-led booking surface
- guide/trust model
- validated reviews
- richer experience storytelling

So `excursions` is architecturally started, not commercially shaped.

### 5. The overlay is real, but still listing-centric

`packages/organization` now owns real cross-capability state, but it is still primarily focused on:

- onboarding
- publication summary
- moderation state
- manual overrides

It has not yet become the broader operator dashboard / blocker / distribution hub implied by the target model.

### 6. Real-provider calendar readiness exists structurally, not operationally by default

The account-first calendar model is correct, and the opt-in integration profile is the right direction.

What is still missing is repeatable live verification of:

- connect
- discover
- attach
- busy-sync
- booking create/update/cancel external event lifecycle

using real provider credentials as a repeatable gated run.

## Architecture Review Priority From This Matrix

The next review and implementation steps should stay in this order:

1. finish operator write paths inside the existing workspace model
2. deepen `packages/organization` from listing-centric overlay to broader operator state
3. complete the `boat_rent` reservation/payment and calendar lifecycle as a real operator and customer workflow
4. shape `excursions` into a real schedule/trust product layer
5. only then push harder on assistant, channel, and owner-distribution business surfaces
