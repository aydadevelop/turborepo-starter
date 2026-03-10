# postgres-drizzle

PostgreSQL and Drizzle ORM best practices. This skill activates automatically when writing database schemas, queries, migrations, or any database-related code.

## Mental model

Use this skill with the following model in mind:

- PostgreSQL is the **system of record** for durable business state.
- PostgreSQL is **transactional and MVCC-based**: reads see snapshots, writes still contend on shared rows and constraints.
- Drizzle is the **typed interface** to that system, not a replacement for database semantics.
- Caches, full-text indexes, vector embeddings, notifications, and analytics views are **downstream systems** derived from PostgreSQL state.
- Common failure categories are:
  - wrong state ownership
  - wrong transaction boundary
  - wrong lock granularity
  - wrong index shape
  - wrong optimizer assumptions

## Topics Covered

| Category | Topics |
|----------|--------|
| **Mental model** | System of record, MVCC, transactions, downstream systems, concurrency |
| **Schema** | Column types, constraints, indexes, enums, JSONB, relations |
| **Queries** | Operators, joins, aggregations, subqueries, transactions |
| **Locking** | Row contention, lock ordering, deadlock avoidance, short transactions |
| **Relations** | One-to-many, many-to-many, relational queries API |
| **Migrations** | drizzle-kit commands, workflows, configuration |
| **PostgreSQL** | MVCC, PG18 features, RLS, partitioning, full-text search, observability |
| **Performance** | Indexing strategies, optimizer behavior, query optimization, connection pooling |
| **Extensions** | When to use sibling `pgvector` and `pg-textsearch` skills |

## Example Usage

```
"Create a users table with email and timestamps"
"Add a posts table with foreign key to users"
"Write a query to get users with their posts"
"Set up drizzle migrations for production"
"Optimize this slow database query"
```

## Skill Structure

- **[SKILL.md](SKILL.md)** - Main skill file (concise overview)
- **Reference Files:**
  - [SCHEMA.md](references/SCHEMA.md) - Column types, constraints, indexes
  - [QUERIES.md](references/QUERIES.md) - Query patterns and operators
  - [MUTATIONS.md](references/MUTATIONS.md) - Transactions, idempotency, upserts, write-path design
  - [TESTING.md](references/TESTING.md) - PGlite harness, workflow tests, real-Postgres verification
  - [RELATIONS.md](references/RELATIONS.md) - Relations API and relational queries
  - [MIGRATIONS.md](references/MIGRATIONS.md) - drizzle-kit workflows
  - [POSTGRES.md](references/POSTGRES.md) - MVCC, locking, observability, PostgreSQL features
  - [PERFORMANCE.md](references/PERFORMANCE.md) - Indexing, optimizer, query tuning, pooling
  - [CHEATSHEET.md](references/CHEATSHEET.md) - Quick reference

## Related extension skills

- [pgvector](../pgvector/SKILL.md) — embeddings, ANN indexes, semantic search
- [pg-textsearch](../pg-textsearch/SKILL.md) — BM25, pg_textsearch, hybrid keyword search

Use `postgres-drizzle` for core modeling and transactional behavior; switch to the sibling skills when the work becomes search-extension-specific.

## Quick Start

```typescript
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Schema
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('users_email_idx').on(table.email),
]);

// Connection
const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema: { users } });

// Query
const user = await db.query.users.findFirst({
  where: eq(users.email, 'user@example.com'),
});
```

## Resources

- **Drizzle Docs**: https://orm.drizzle.team
- **PostgreSQL Docs**: https://www.postgresql.org/docs/18/
