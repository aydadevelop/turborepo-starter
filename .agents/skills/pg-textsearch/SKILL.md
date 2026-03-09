---
name: pg-textsearch
description: "BM25 ranked full-text search for PostgreSQL via pg_textsearch extension. Use when implementing keyword search, BM25 indexes, hybrid search combining BM25 + pgvector, or tuning text search performance. Trigger terms: bm25, pg_textsearch, full-text search, keyword search, text search, hybrid search, reciprocal rank fusion, RRF."
---

# pg_textsearch — BM25 Full-Text Search for PostgreSQL

Modern ranked text search using BM25 scoring. Replaces native `tsvector`/`ts_rank` with
corpus-aware ranking, term frequency saturation, and Block-Max WAND optimization.

**Repository:** <https://github.com/timescale/pg_textsearch>

## Prerequisites

1. PostgreSQL 17 or 18.
2. `shared_preload_libraries = 'pg_textsearch'` in `postgresql.conf` — requires PG restart.
3. `CREATE EXTENSION pg_textsearch;` per database.

## Core concepts

- **BM25 scoring** — corpus-aware: rare terms weighted higher (IDF), term repetition saturates (k1), document length normalized (b).
- **Scores are negative** — lower (more negative) = better match. `ORDER BY score ASC` or just `ORDER BY column <@> query`.
- **Single-column indexes** — one BM25 index per text column. Create separate indexes for `name` and `description`.
- **Index-after-load** — bulk insert data first, then `CREATE INDEX` for fastest builds.

## Index creation

```sql
-- Basic index with language config
CREATE INDEX listing_name_bm25_idx ON listing USING bm25(name) WITH (text_config='russian');
CREATE INDEX listing_desc_bm25_idx ON listing USING bm25(description) WITH (text_config='russian');

-- Custom BM25 parameters
CREATE INDEX custom_idx ON documents USING bm25(content)
    WITH (text_config='english', k1=1.5, b=0.8);

-- Multiple languages on same column (different indexes)
CREATE INDEX idx_en ON docs USING bm25(content) WITH (text_config='english');
CREATE INDEX idx_ru ON docs USING bm25(content) WITH (text_config='russian');
CREATE INDEX idx_simple ON docs USING bm25(content) WITH (text_config='simple');
```

### Parallel index builds

```sql
SET max_parallel_maintenance_workers = 4;
SET maintenance_work_mem = '256MB';  -- Must be >= 64MB for parallel
CREATE INDEX listing_desc_bm25_idx ON listing USING bm25(description) WITH (text_config='russian');
-- NOTICE: parallel index build: launched 4 of 4 requested workers
```

## Query patterns

### Basic ranked search

```sql
-- ORDER BY auto-detects index from column
SELECT id, name, name <@> 'яхта аренда' AS score
FROM listing
ORDER BY name <@> 'яхта аренда'
LIMIT 20;
```

### Explicit index (required in WHERE clauses and PL/pgSQL)

```sql
SELECT id, name, description <@> to_bm25query('sunset cruise', 'listing_desc_bm25_idx') AS score
FROM listing
WHERE description <@> to_bm25query('sunset cruise', 'listing_desc_bm25_idx') < -0.5
ORDER BY score
LIMIT 20;
```

### Pre-filtering with other indexes

```sql
-- B-tree index on organizationId filters first, then BM25 scores reduced set
SELECT id, name
FROM listing
WHERE organization_id = $1
ORDER BY description <@> 'search terms'
LIMIT 10;
```

### Post-filtering by score threshold

```sql
SELECT id, name
FROM listing
WHERE description <@> to_bm25query('search terms', 'listing_desc_bm25_idx') < -1.0
ORDER BY description <@> 'search terms'
LIMIT 10;
```

## Hybrid search — BM25 + pgvector (RRF)

Reciprocal Rank Fusion combines keyword precision with semantic understanding in one query:

```sql
WITH keyword_results AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY description <@> to_bm25query(:query, 'listing_desc_bm25_idx')) AS rank_kw
  FROM listing
  ORDER BY description <@> to_bm25query(:query, 'listing_desc_bm25_idx')
  LIMIT 20
),
semantic_results AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY embedding <=> :query_vec) AS rank_vec
  FROM listing
  ORDER BY embedding <=> :query_vec
  LIMIT 20
)
SELECT COALESCE(k.id, s.id) AS id,
       COALESCE(1.0 / (60 + k.rank_kw), 0.0) +
       COALESCE(1.0 / (60 + s.rank_vec), 0.0) AS rrf_score
FROM keyword_results k
FULL OUTER JOIN semantic_results s ON k.id = s.id
ORDER BY rrf_score DESC
LIMIT 10;
```

### Weighted RRF (tunable blend)

```sql
-- 70% semantic, 30% keyword
0.7 * COALESCE(1.0 / (60 + rank_vec), 0.0) +
0.3 * COALESCE(1.0 / (60 + rank_kw), 0.0) AS rrf_score
```

## Drizzle ORM integration

### Native full-text search (tsvector / GIN — built into Postgres)

Drizzle doesn't support `tsvector` as a column type natively, but you can use
`to_tsvector` / `to_tsquery` with the `sql` operator and create GIN indexes in the schema.

#### Schema with GIN index (single column)

```typescript
import { index, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
  },
  (table) => [
    index('title_search_index').using('gin', sql`to_tsvector('english', ${table.title})`),
  ],
);
```

#### Schema with GIN index (multi-column, weighted)

Use `setweight` to prioritize title (A) over description (B):

```typescript
export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
  },
  (table) => [
    index('search_index').using(
      'gin',
      sql`(
        setweight(to_tsvector('english', ${table.title}), 'A') ||
        setweight(to_tsvector('english', ${table.description}), 'B')
      )`,
    ),
  ],
);
```

#### Basic search query

```typescript
import { sql } from 'drizzle-orm';

const title = 'trip';
await db
  .select()
  .from(posts)
  .where(sql`to_tsvector('english', ${posts.title}) @@ to_tsquery('english', ${title})`);
```

#### Query variants

```typescript
// Match any keyword (OR): use | separator
const q1 = 'Europe | Asia';
await db.select().from(posts)
  .where(sql`to_tsvector('english', ${posts.title}) @@ to_tsquery('english', ${q1})`);

// Match all keywords (AND): plainto_tsquery joins with &
const q2 = 'discover Italy';
await db.select().from(posts)
  .where(sql`to_tsvector('english', ${posts.title}) @@ plainto_tsquery('english', ${q2})`);

// Phrase match (word order matters): phraseto_tsquery
const q3 = 'family trip';
await db.select().from(posts)
  .where(sql`to_tsvector('english', ${posts.title}) @@ phraseto_tsquery('english', ${q3})`);

// Web-style syntax (OR, quotes, -exclude): websearch_to_tsquery
const q4 = 'family or first trip Europe or Asia';
await db.select().from(posts)
  .where(sql`to_tsvector('english', ${posts.title}) @@ websearch_to_tsquery('english', ${q4})`);
```

#### Multi-column search

```typescript
const q = 'plan';
await db.select().from(posts)
  .where(sql`(
    setweight(to_tsvector('english', ${posts.title}), 'A') ||
    setweight(to_tsvector('english', ${posts.description}), 'B')
  ) @@ to_tsquery('english', ${q})`);
```

#### Ranking with ts_rank / ts_rank_cd

Use `getColumns` (drizzle-orm >=1.0.0-beta.2) or `getTableColumns` (pre-1.0).

```typescript
import { desc, getColumns, sql } from 'drizzle-orm';

const search = 'culture | Europe | Italy | adventure';
const matchQuery = sql`(
  setweight(to_tsvector('english', ${posts.title}), 'A') ||
  setweight(to_tsvector('english', ${posts.description}), 'B')
), to_tsquery('english', ${search})`;

await db
  .select({
    ...getColumns(posts),
    rank: sql`ts_rank(${matchQuery})`,
    rankCd: sql`ts_rank_cd(${matchQuery})`,
  })
  .from(posts)
  .where(sql`(
    setweight(to_tsvector('english', ${posts.title}), 'A') ||
    setweight(to_tsvector('english', ${posts.description}), 'B')
  ) @@ to_tsquery('english', ${search})`)
  .orderBy((t) => desc(t.rank));
```

- `ts_rank` — frequency of query terms throughout the document.
- `ts_rank_cd` — proximity of query terms within the document.

### BM25 search (pg_textsearch extension)

Drizzle has no typed BM25 / `<@>` operator support. Use `sql` template for queries,
custom SQL migrations for indexes.

#### BM25 query

```typescript
const results = await db.execute(sql`
  SELECT l.id, l.name,
         l.description <@> to_bm25query(${searchTerm}, 'listing_desc_bm25_idx') AS score
  FROM listing l
  WHERE l.description <@> to_bm25query(${searchTerm}, 'listing_desc_bm25_idx') < -0.5
  ORDER BY score
  LIMIT ${limit}
`);
```

#### BM25 migration (custom SQL)

```sh
npx drizzle-kit generate --custom
```

```typescript
import { sql } from 'drizzle-orm';

export async function up(db) {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_textsearch`);
  await db.execute(sql`
    CREATE INDEX listing_name_bm25_idx ON listing USING bm25(name) WITH (text_config='russian')
  `);
  await db.execute(sql`
    CREATE INDEX listing_desc_bm25_idx ON listing USING bm25(description) WITH (text_config='russian')
  `);
}
```

### Hybrid search — BM25 + pgvector (RRF) via Drizzle

```typescript
import { sql } from 'drizzle-orm';

const hybridResults = await db.execute(sql`
  WITH vector_search AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY embedding <=> ${sql`${queryEmbedding}::vector`}) AS rank
    FROM listing
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${sql`${queryEmbedding}::vector`}
    LIMIT 20
  ),
  keyword_search AS (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY description <@> to_bm25query(${query}, 'listing_desc_bm25_idx')
           ) AS rank
    FROM listing
    ORDER BY description <@> to_bm25query(${query}, 'listing_desc_bm25_idx')
    LIMIT 20
  )
  SELECT
    COALESCE(v.id, k.id) AS id,
    COALESCE(1.0 / (60 + v.rank), 0.0) +
    COALESCE(1.0 / (60 + k.rank), 0.0) AS combined_score
  FROM vector_search v
  FULL OUTER JOIN keyword_search k ON v.id = k.id
  WHERE v.id IS NOT NULL OR k.id IS NOT NULL
  ORDER BY combined_score DESC
  LIMIT ${limit}
`);
```

#### Weighted hybrid (70% vector, 30% keyword)

```typescript
const weighted = await db.execute(sql`
  WITH vector_search AS ( /* same as above */ ),
       keyword_search AS ( /* same as above */ )
  SELECT
    COALESCE(v.id, k.id) AS id,
    0.7 * COALESCE(1.0 / (60 + v.rank), 0.0) +
    0.3 * COALESCE(1.0 / (60 + k.rank), 0.0) AS combined_score
  FROM vector_search v
  FULL OUTER JOIN keyword_search k ON v.id = k.id
  WHERE v.id IS NOT NULL OR k.id IS NOT NULL
  ORDER BY combined_score DESC
  LIMIT ${limit}
`);
```

## Configuration (GUCs)

| Setting | Default | Description |
|---------|---------|-------------|
| `pg_textsearch.default_limit` | 1000 | Max docs scored without LIMIT clause |
| `pg_textsearch.compress_segments` | on | Delta encoding + bitpacking (41% smaller) |
| `pg_textsearch.segments_per_level` | 8 | Segments before auto compaction (2-64) |
| `pg_textsearch.bulk_load_threshold` | 100000 | Terms per transaction before auto-spill |
| `pg_textsearch.memtable_spill_threshold` | 32000000 | Posting entries before auto-spill |
| `pg_textsearch.enable_bmw` | true | Block-Max WAND optimization (4x faster top-k) |
| `pg_textsearch.log_bmw_stats` | false | Log block skip stats for debugging |

## Performance tuning

- **Always use `LIMIT`** — enables Block-Max WAND optimization, skips non-competitive blocks.
- **Force-merge after bulk load** — `SELECT bm25_force_merge('index_name');` consolidates segments.
- **Create indexes after data load** — not before.
- **Pre-filter with B-tree** on selective columns (org_id, status) before BM25 scoring.
- **Monitor:** `SELECT bm25_summarize_index('index_name');` for corpus stats and memory usage.

## Monitoring

```sql
-- Check BM25 index usage
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE indexrelid::regclass::text ~ 'bm25';

-- Index summary (corpus stats, memory)
SELECT bm25_summarize_index('listing_desc_bm25_idx');

-- Force memtable spill to disk
SELECT bm25_spill_index('listing_desc_bm25_idx');

-- Merge all segments (after bulk loads)
SELECT bm25_force_merge('listing_desc_bm25_idx');
```

## Limitations

- Single-column indexes only.
- No phrase search (exact multi-word phrases).
- Requires `shared_preload_libraries` — can't enable at runtime.
- PL/pgSQL requires explicit `to_bm25query(text, index_name)` — auto-detect doesn't work.
- Partitioned tables: BM25 scores use partition-local statistics (not globally comparable).
- Word length limit: 2047 characters (PostgreSQL tsvector limit).

## Docker setup

```dockerfile
FROM postgres:17
RUN apt-get update && apt-get install -y postgresql-17-pgvector && rm -rf /var/lib/apt/lists/*
ADD https://github.com/timescale/pg_textsearch/releases/download/v1.0.0/pg_textsearch-v1.0.0-pg17-linux-amd64.tar.gz /tmp/
RUN tar -xzf /tmp/pg_textsearch-*.tar.gz -C /usr/lib/postgresql/17/ && rm /tmp/pg_textsearch-*.tar.gz
RUN echo "shared_preload_libraries = 'pg_textsearch'" >> /usr/share/postgresql/postgresql.conf.sample
```

## Available text search configs

`simple`, `arabic`, `armenian`, `basque`, `catalan`, `danish`, `dutch`, `english`, `finnish`, `french`, `german`, `greek`, `hindi`, `hungarian`, `indonesian`, `irish`, `italian`, `lithuanian`, `nepali`, `norwegian`, `portuguese`, `romanian`, `russian`, `serbian`, `spanish`, `swedish`, `tamil`, `turkish`, `yiddish`.
