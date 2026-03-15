# Pulumi deployment contract

This directory is the source of truth for durable server-side infrastructure changes.

## Pulumi owns

- VPS lifecycle (`src/onegb-vps.ts`)
- Server bootstrap: Docker, Dokku, plugins, firewall, fail2ban, SSH hardening, `sslh` (`src/vps-bootstrap.ts`)
- Dokku apps, domains, ports, registry login, env vars, Postgres link, Let's Encrypt, observability sidecars (`src/dokku-apps.ts`)
- Cloudflare DNS (`src/dns.ts`)
- Optional storage and support-email routing resources (`src/storage.ts`, `src/support-email-routing.ts`)
- GitHub Actions deploy secrets sync for SSH access (`src/index.ts`)

## Workflow contract

- CI runs on GitHub-hosted runners from `.github/workflows/ci.yml`
- Docker deploy images are built from `.github/workflows/deploy-docker.yml`
- Dokku deploy + migration jobs target a self-hosted runner labeled `self-hosted` and `vps`
- Local parity validation uses:
  - `bun run infra:preview`
  - `act -W .github/workflows/ci.yml --validate`
  - `act -W .github/workflows/deploy-docker.yml --validate`
  - `bun run act:deploy:dry`

## Important current gap

Pulumi **does not currently install or register** the GitHub Actions runner service on the VPS.

That means the following server-side requirement is still manual/documented operational state:

- install the GitHub Actions runner on the VPS
- register it with the repository
- assign the `self-hosted` and `vps` labels

Pulumi provisions the host, networking, Dokku, and GitHub deploy secrets that the runner uses, but the runner registration itself is not yet automated in this stack.

## Local Docker e2e note

The deployment-like e2e flow intentionally avoids depending on the normal root `.env` file.
It uses:

- `.env.e2e.empty` as the compose env-file input for app containers
- explicit host-port env vars from `scripts/e2e-docker-compose.mjs`
- explicit E2E baseline seeding via `packages/db/src/e2e/seed.ts`

This keeps the Docker e2e gate reproducible across local Compose versions and avoids hidden baseline assumptions.

## When changing server behavior

If a change affects any of the following, update Pulumi code or this README in the same PR:

- host bootstrap steps
- Dokku app shape, ports, domains, plugins, env vars, or attached services
- deploy workflow assumptions about the VPS
- GitHub secret/runner/server coordination

## Staging demo seed

- The server image supports an idempotent demo seed on startup.
- Pulumi controls this through Dokku env vars:
  - `SEED_DEMO_DATA`
  - `SEED_ANCHOR_DATE`
- Staging currently enables demo seeding so a freshly reset or empty database is repopulated automatically on the next `server` start.
- The seed path uses `packages/db/scripts/seed-local.mjs --append --skip-if-present`, so restarts are safe and do not duplicate the seed namespace once it exists.
