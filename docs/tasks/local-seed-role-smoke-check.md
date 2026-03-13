# Local Seed Role Smoke Check

Use this task when you want a fast local-product sanity pass against the current dev seed, using the real app and a real browser.

## Goal

Prove that the current local schema baseline, dev seed, seeded role login, and core seeded operator surfaces still work together.

This is a smoke task, not a full regression suite.

## Skills

- [$postgres-drizzle](/Users/d/Documents/Projects/turborepo-alchemy/.agents/skills/drizzle-postgress/SKILL.md)
- [$playwright](/Users/d/.codex/skills/playwright/SKILL.md)

## Preconditions

- PostgreSQL is running locally on `localhost:5432`
- The repo root is `/Users/d/Documents/Projects/turborepo-alchemy`
- The local app uses `.env`
- No production deploy exists yet, so local reset + migration replay is allowed

## Local Database Flow

Run these from the repo root unless otherwise noted.

1. Reset the local database state:

```bash
cd packages/db
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/myapp' bun run db:reset:local
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/myapp' bun run db:migrate:dev
cd ../..
```

2. Seed the current dev baseline:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/myapp' node packages/db/scripts/seed-local.mjs
```

3. Confirm the seed output includes:

- `Admin login: admin@admin.com / admin`
- `Operator login: operator@example.com / operator`
- `Listings: 2, bookings: 1`

## Local App Startup

Start the server and web app in separate shells.

Server:

```bash
cd /Users/d/Documents/Projects/turborepo-alchemy/apps/server
set -a && . ../../.env && set +a
bun run start:test
```

Expected:

- `Server listening on http://:::3000`

Web:

```bash
cd /Users/d/Documents/Projects/turborepo-alchemy/apps/web
set -a && . ../../.env && set +a
bun run dev -- --host localhost --port 5173
```

Expected:

- local Vite URL is `http://localhost:5173/`

## Seeded Role To Use

Use the seeded operator:

- email: `operator@example.com`
- password: `operator`

## Browser Smoke Scenarios

Run these with a real browser.

### Scenario 1: Operator Login

1. Open `http://localhost:5173/login`
2. Sign in with the seeded operator credentials
3. Confirm the signed-in header shows:
   - `Starter Organization`
   - `Operations User`

### Scenario 2: Organization Listings Surface

1. Open `http://localhost:5173/org/listings`
2. Confirm:
   - total listings is `2`
   - published listings is `2`
   - one manual override is visible
   - the seeded excursion listing exists
   - the seeded boat listing exists
3. Capture a screenshot:
   - `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/local-seed-operator-listings.png`

### Scenario 3: Boat Listing Workspace

1. Open `http://localhost:5173/org/listings/seed_listing_boat_1`
2. Confirm:
   - workspace header says `Listing workspace`
   - service family is `Boat rent`
   - operator model is `Duration-led`
   - `Boat rent profile` fields are visible
   - the basics tab shows capacity, captain policy, departure area, and base port
3. Capture a screenshot:
   - `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/local-seed-boat-workspace.png`

### Scenario 4: Public Customer Surface

1. Open `http://localhost:5173/listings`
2. Confirm:
   - both seeded listings render
   - the boat listing shows `Boat rent`
   - the excursion listing shows `Excursions`
3. Capture a screenshot:
   - `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/local-seed-public-listings.png`

### Scenario 5: Public Boat Booking Surface

1. Open `http://localhost:5173/listings/seed_listing_boat_1`
2. Confirm:
   - page title is `Ocean Retreat`
   - `Boat rent profile` is visible
   - booking panel title is `Request this charter`
3. Fill:
   - date: `2026-03-16`
4. Confirm the live booking surface appears and shows:
   - available slots count
   - blocked slots count
   - special pricing count
   - a quote summary
   - `Request booking` becomes enabled once the surface is ready
5. Capture a screenshot:
   - `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/local-seed-public-boat-detail.png`

## Current Known Result

As of March 12, 2026:

- operator login works
- org listings/operator overlay works
- boat workspace works
- public listings render correctly
- public boat detail renders correctly
- the seeded boat booking surface renders live slots and quote summary after selecting `2026-03-16`

Regression reference:

- previous failing screenshot before the root QueryClient fix:
  - `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/local-seed-public-listings-500.png`

## Output Format For A Future Subagent

Return:

1. Seed status
2. App startup status
3. Scenario results
4. Screenshots captured
5. Failures found
6. Whether the failure is new or a regression of a previously fixed path

## Shutdown

Stop the server and web processes after the run.
