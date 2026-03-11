# Support Email Worker

Cloudflare Email Worker that receives inbound support email, normalizes it, and forwards a typed JSON payload to the server intake route at `/api/support/inbound/email`.

## Local development

Cloudflare now supports local Email Worker development with `wrangler dev` and the `/cdn-cgi/handler/email` endpoint:

- [Local development support for Email Workers](https://developers.cloudflare.com/changelog/post/2025-04-08-local-development/)
- [Email Workers local development docs](https://developers.cloudflare.com/email-routing/email-workers/local-development/)

Recommended local loop:

1. Start the app stack:
   - `docker compose up -d db seaweedfs seaweedfs-init smtp-server server notifications`
2. Configure server env so the intake route accepts worker traffic:
   - `SUPPORT_EMAIL_INTAKE_SECRET`
   - `SUPPORT_EMAIL_INTAKE_ORGANIZATION_ID`
3. Create `apps/support-email-worker/.dev.vars` from `.dev.vars.example` and set:
   - `SUPPORT_EMAIL_WEBHOOK_SECRET`
4. Run the worker:
   - `bun run --cwd apps/support-email-worker dev`
5. Send a fixture through the Cloudflare local email handler:
   - `bun run --cwd apps/support-email-worker test:email:local`

## Test lanes

- Unit:
  - `packages/notifications/src/email/__tests__/fake.test.ts`
  - `packages/notifications/src/email/__tests__/channel-provider.test.ts`
  - `packages/api/src/__tests__/support-email-intake.test.ts`
- Worker unit:
  - `apps/support-email-worker/src/__tests__/normalize.test.ts`
  - `apps/support-email-worker/src/__tests__/index.test.ts`
- SMTP integration:
  - Start `smtp4dev` via `docker compose up -d smtp-server`
  - Run `bun run --cwd packages/notifications test:integration:smtp4dev`
- E2E / manual:
  - `docker-compose.e2e.yml` now exposes smtp4dev UI and SMTP on host ports for Playwright or manual assertions

## Deployment

Deploy split:

- Worker code deploys with Wrangler from `.github/workflows/deploy-support-email-worker.yml`
- Email Routing configuration is managed in Pulumi via `infra/pulumi/src/support-email-routing.ts`

GitHub environment requirements:

- Secrets:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `SUPPORT_EMAIL_WEBHOOK_SECRET`
- Variables:
  - `SUPPORT_EMAIL_WEBHOOK_URL`
  - `SUPPORT_EMAIL_ALLOWED_RECIPIENTS`
  - optional `SUPPORT_EMAIL_WORKER_NAME`

Pulumi config:

- `supportEmail:enabled=true`
- `supportEmail:workerScriptName=<worker name>`
- optional `supportEmail:localPart=support`

The Pulumi worker routing rule must reference the deployed Worker name. Keep the Wrangler worker name and `supportEmail:workerScriptName` aligned.
