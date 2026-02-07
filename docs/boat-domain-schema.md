# Boat Domain Schema (Scratch-First)

Date: 2026-02-06

## Goals

- Keep boat management modular and extendable without generic `entity:any` CRUD.
- Enforce organization scope at query time for every operation.
- Use typed oRPC contracts per sub-domain (core, assets, availability, pricing, calendar).
- Keep pricing and availability auditable and version-friendly.

## Table Design

### Core

- `boat`: core boat profile and operational status.
- `boat_dock`: dock/location catalog scoped by organization.

### Feature and Content

- `boat_amenity`: key-based amenity set per boat.
- `boat_asset`: image/document metadata (storage key, purpose, review status).

### Calendar and Availability

- `boat_calendar_connection`: external provider links (Google, Outlook, iCal, manual).
- `boat_availability_rule`: recurring weekly windows (day + minute range).
- `boat_availability_block`: concrete unavailable intervals (manual/system/calendar/maintenance).

### Pricing

- `boat_pricing_profile`: versionable base pricing and fee configuration.
- `boat_pricing_rule`: conditional adjustments linked to boat and optional profile.

## Guard Strategy

- API context resolves `activeMembership` from Better Auth session.
- Every boat-domain operation uses `organizationPermissionProcedure`.
- Mutating operations resolve boat ownership via `(boat.id, organization_id)` before changes.
- Cross-entity writes (dock/calendar/profile references) verify the referenced row belongs to the same boat/org scope.

## oRPC Organization

`packages/api/src/routers/boat.ts` exposes strongly-typed operations:

- Core boat: `listManaged`, `getManaged`, `createManaged`, `updateManaged`, `archiveManaged`
- Docks: `dockListManaged`, `dockUpsertManaged`
- Amenities: `amenityListManaged`, `amenityReplaceManaged`
- Assets: `assetListManaged`, `assetCreateManaged`
- Calendar: `calendarListManaged`, `calendarUpsertManaged`
- Availability rules/blocks: list/replace/create/delete methods
- Pricing profiles/rules: list/create/set-default/delete methods

All input contracts are centralized in `packages/api/src/routers/boat.schemas.ts`.

## Why This Structure

- New features can be added per concern without rewriting core boat table.
- Availability and pricing can evolve independently and be tested in isolation.
- Permissions stay explicit (`boat.create/read/update/delete`) and map directly to API intent.
