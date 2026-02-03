# Better-T-Stack Project Rules

This is a my-better-t-app project created with Better-T-Stack CLI.

## Project Structure

This is a monorepo with the following structure:

- **`apps/web/`** - Frontend application (SvelteKit)

- **`apps/server/`** - Backend server (Hono)

- **`packages/api/`** - Shared API logic and types
- **`packages/auth/`** - Authentication logic and utilities
- **`packages/db/`** - Database schema and utilities
- **`packages/env/`** - Shared environment variables and validation
- **`packages/config/`** - Shared TypeScript configuration
- **`packages/infra/`** - Infrastructure as code (Alchemy for Cloudflare)

## Available Scripts

- `npm run dev` - Start all apps in development mode
- `npm run dev:web` - Start only the web app
- `npm run dev:server` - Start only the server
- `npm run build` - Build all apps
- `npm run lint` - Lint all packages
- `npm run typecheck` - Type check all packages

## Database Commands

All database operations should be run from the server workspace:

- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open database studio
- `npm run db:generate` - Generate Drizzle files
- `npm run db:migrate` - Run database migrations

Database schema files are located in `packages/db/src/schema/`

## API Structure

- oRPC contracts and routers are in `packages/api/src/`
- Client-side oRPC client is in `apps/web/src/utils/orpc.ts`

## Authentication

Authentication is powered by Better Auth:

- Auth configuration is in `packages/auth/src/`
- Web app auth client is in `apps/web/src/lib/auth-client.ts`

## Project Configuration

This project includes a `bts.jsonc` configuration file that stores your Better-T-Stack settings:

- Contains your selected stack configuration (database, ORM, backend, frontend, etc.)
- Used by the CLI to understand your project structure
- Safe to delete if not needed

## Key Points

- This is a Turborepo monorepo using npm workspaces
- Each app has its own `package.json` and dependencies
- Run commands from the root to execute across all workspaces
- Run workspace-specific commands with `npm run command-name`
- Turborepo handles build caching and parallel execution
