---
phase: 03-org-access-catalog-storefront
plan: "01"
subsystem: auth
tags: [rbac, auth, organization, listing, permissions]

requires:
	- phase: 02-events-workflows-parity-foundations
		provides: "package conventions and auth foundation for extracted domains"
provides:
	- "listing resource permissions across organization roles"
	- "Acceptance tests for listing authorization behavior"
affects: [catalog, api, operator-surfaces]

tech-stack:
	added: []
	patterns:
		- "Operator resources are added centrally in organization-access.ts with role-focused acceptance tests"

key-files:
	created: []
	modified:
		- packages/auth/src/organization-access.ts
		- packages/auth/src/__tests__/organization-access.test.ts

key-decisions:
	- "Customer listing access stays empty in RBAC because storefront browse is public"

patterns-established:
	- "When a new org-scoped resource is introduced, update both statements and every role definition"

requirements-completed: []

duration: "n/a"
completed: 2026-03-09
---

# 03-01 Summary: RBAC listing resource

## Status: Complete

## What Was Built

Added `listing` as a resource to the organization RBAC system in `packages/auth/src/organization-access.ts`. All 6 role definitions updated with appropriate permissions.

## Role Permissions Assigned

| Role | listing permissions |
|------|---------------------|
| org_owner | create, read, update, delete |
| org_admin | create, read, update, delete |
| manager | create, read, update |
| agent | read |
| member | read |
| customer | (none — storefront browse is public/unauthenticated) |

## Files Modified

- `packages/auth/src/organization-access.ts` — added `listing` to `organizationStatements` and to all 6 `newRole()` objects
- `packages/auth/src/__tests__/organization-access.test.ts` — added `describe("listing resource permissions", ...)` with 8 tests

## Tests

17 tests pass in organization-access.test.ts (8 existing + new listing tests):
- org_owner can create listing ✓
- org_owner can delete listing ✓
- org_admin can update listing ✓
- manager cannot delete listing ✓
- manager can create listing ✓
- agent cannot create listing ✓
- agent can read listing ✓
- customer has no listing permissions ✓

## Key Decision

`customerAc` gets `listing: []` — storefront browse is public (unauthenticated), no role gate needed.

## Commit

`075f952` — feat(03-01): add listing RBAC resource and acceptance tests
