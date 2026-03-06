# Contaktly Demo Recording

Use this when you want a clean local state for recording.

## Start

```bash
bun run demo:contaktly
```

This will:

- kill the Contaktly demo ports
- reset and reseed the local database
- start `server`, `assistant`, `notifications`, `web`, `widget`, and `site-astro`

## URLs

- web: `http://localhost:5173`
- widget: `http://localhost:5174`
- Astro host: `http://localhost:4321`

## Demo Credentials

- admin: `admin@admin.com / admin`
- operator: `operator@example.com / operator`

## Verify Before Recording

```bash
bun run demo:contaktly:verify
```

This runs the targeted Contaktly browser coverage:

- auth flow
- overview, analytics, and staged plan
- widget config and Google calendar connection
- admin conversations
- meetings queue
- prefill flow and derived knowledge inventory
- widget host and Astro embed flow
