# Contaktly Phase 1 Stage Matrix

Reviewed on `2026-03-06`.

This document turns the revised Phase 1 plan into executable slices by:

- actor
- stage
- desired outcome
- implementation target
- E2E contract

## Stages

- `POC`
  - prove the workflow and reduce unknowns fast
  - allowed to use seeded or simplified integrations
- `MVP`
  - customer-usable path with real auth, persistence, and handoff
  - suitable for onboarding the first real workspace

## Slice Order

1. widget loader + iframe + session resume
2. admin config overview + snippet generation
3. Astro scrape prefill + draft review
4. deterministic qualification flow
5. calendar connection + booking
6. knowledge ingest + retrieval toggle
7. analytics + eval runs

## Matrix

| Actor | Stage | Want to | Implementation target | E2E contract |
| --- | --- | --- | --- | --- |
| Visitor | `POC` | open widget from embedded site and continue after reload | `apps/widget`, `apps/site-astro`, `packages/contaktly-widget` | widget boots, asks one question at a time, reload preserves history |
| Visitor | `MVP` | move between homepage and pricing and keep same session | shared `visitorId + configId` session persistence | homepage and pricing resume same conversation and persist tags |
| Workspace admin | `POC` | see config id, copy snippet, and understand embed model | `/dashboard/contaktly`, `/dashboard/contaktly/widget` | admin sees shipping slices, config id, and generated snippet |
| Workspace admin | `MVP` | edit workspace config and allowed domains | `contaktly.admin.workspaceConfig` + admin form routes | admin saves config, snippet reflects config, disallowed domain is blocked |
| Workspace admin | `POC` | paste a calendar URL for booking CTA | manual booking URL field on config | booking CTA opens configured URL from widget |
| Workspace admin | `MVP` | connect Google with OAuth and grant calendar access | `contaktly_calendar_connection`, Better Auth Google provider scopes, server token storage | admin completes OAuth, connection state persists, booking uses connected calendar |
| Workspace admin | `POC` | enter a website URL and see a draft config suggestion | scrape job + extracted draft preview | Astro site URL returns draft opening message, starter cards, and qualification text |
| Workspace admin | `MVP` | review and save the scrape-based draft | prefill review UI + config save mutation | saved draft updates widget bootstrap behavior |
| Sales operator | `POC` | inspect seeded conversations and qualification progress | `/dashboard/contaktly/conversations` seeded CRM view | conversations list/detail render seeded threads and selected transcript |
| Sales operator | `MVP` | inspect real leads and booking outcomes | conversation, lead profile, booking read models | widget conversation appears in CRM with status and meeting outcome |
| Visitor | `POC` | answer a guided qualification flow and reach booking CTA | deterministic Contaktly flow runner | one active prompt only, no duplicate assistant turns |
| Visitor | `MVP` | book a Google-backed meeting inline | booking service + appointment type availability | qualified visitor books a meeting and sees confirmation |
| Workspace admin | `POC` | ingest knowledge source into storage | knowledge document ingest only | add link creates stored document with extracted content metadata |
| Workspace admin | `MVP` | optionally enable retrieval for extra context | retrieval toggle on config, tool-assisted lookup | retrieval-off keeps flow deterministic, retrieval-on adds cited context |
| Workspace admin | `POC` | see basic journey metrics | seeded analytics cards and tables | analytics page renders seeded widget loads, chats, and meetings |
| Workspace admin | `MVP` | inspect eval runs and regressions | `contaktly_eval_run` queue + admin page | eval run table shows deterministic flow checks and latest status |

## Immediate Build Targets

### Completed

- widget loader + iframe + session resume
- persistent conversation state and deterministic qualification
- widget-host and Astro-embed reload E2E

### Next

1. admin config overview and staged plan surface
2. admin snippet and config workflow E2E
3. scrape-prefill draft contract
4. calendar connection split:
   `POC`: manual booking URL
   `MVP`: Google OAuth + calendar access

## Calendar Split

### `POC`

- workspace admin pastes a booking URL
- widget exposes the booking CTA after qualification
- no provider API dependency

### `MVP`

- workspace admin signs in with Google and grants Calendar scopes
- server stores refresh token securely
- appointment types are derived from connected calendar rules
- booking creates calendar event and returns meeting link

## E2E Philosophy

- use E2E to lock each vertical slice at the actor journey level
- use unit and integration tests for deterministic engine, idempotency, and provider adapters
- add `fixme` or scaffolded specs only when the UI route already exists; otherwise keep the matrix here until the slice starts
