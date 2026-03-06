# Contaktly High-Fidelity Audit

Reviewed on `2026-03-06` against the local Contaktly stack:

- web: `http://localhost:5173`
- widget: `http://localhost:5174`
- Astro host: `http://localhost:4321`
- server: `http://localhost:3000`

## Surfaces Checked

- `/login`
- `/dashboard/settings`
- `/dashboard/contaktly`
- `/dashboard/contaktly/analytics`
- `/dashboard/contaktly/meetings`
- `/dashboard/contaktly/knowledge`
- `/dashboard/contaktly/widget`
- `/dashboard/contaktly/prefill`
- `/dashboard/contaktly/conversations`
- widget app root `/`
- widget host `/widget?params=...`
- Astro host `/` and `/pricing`

## Verified Working

- seeded admin can sign in through the real login form
- authenticated visit to `/login` redirects back to the dashboard
- Contaktly admin sub-navigation works
- overview now shows live workspace metrics instead of only the delivery matrix
- analytics page exposes current conversation, qualification, calendar, and prefill state
- meetings page exposes the real booking handoff path plus the ready-to-book queue
- knowledge page reflects the persisted prefill draft as a derived source inventory
- widget config page loads persisted booking URL and connects Google calendar
- prefill draft generation works against the live Astro fixture site
- conversations inbox is org-scoped and refreshes live via polling
- widget chat streams one step at a time through the public oRPC API
- Astro home and pricing share the same anonymous widget conversation state
- widget page context and page-specific tags survive cross-page navigation

## Fixed During Audit

- replaced broken TanStack auth forms on login/signup with plain Svelte state
- hid Telegram login on localhost so the invalid Telegram iframe no longer pollutes auth
- redirected authenticated users away from `/login`
- removed Astro dev toolbar from the demo site
- updated prefill placeholder to the live Astro dev host
- fixed the public embed loader to use the current widget sizing logic
- disabled loader caching to avoid stale widget behavior during manual checks
- made widget E2E config seeding idempotent against both Contaktly uniqueness constraints
- reduced notification-stream teardown noise during route changes

## Current Product Reality

- customer chat is streamed
- admin `/conversations` is live by short polling, not by a second stream transport
- booking is still split:
  - `POC`: booking URL CTA
  - `MVP`: Google calendar connection state is real, but native inline booking is still a later slice

## Verification Runs

- `bun run demo:contaktly:verify`
- Result:
  - API tests: `63 passed | 3 todo`
  - authenticated admin/browser suite: `19 passed`
  - widget/Astro embed suite: `5 passed`
