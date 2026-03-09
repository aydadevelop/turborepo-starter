---
name: pgvector
description: "Vector similarity search with pgvector for PostgreSQL and Drizzle ORM. Use when implementing semantic search, embedding storage, HNSW/IVFFlat indexes, image search, RAG retrieval, or hybrid search with BM25. Trigger terms: pgvector, vector, embedding, similarity search, cosine distance, HNSW, IVFFlat, semantic search, RAG, vector index."
---

# pgvector — Vector Similarity Search for PostgreSQL

Store, index, and query vector embeddings directly in PostgreSQL. Enables semantic search,
image similarity, RAG retrieval, and recommendation systems without external vector databases.

**Repository:** <https://github.com/pgvector/pgvector>

## Prerequisites

1. PostgreSQL with pgvector installed (`apt install postgresql-17-pgvector` or included in most managed PG).
2. `CREATE EXTENSION IF NOT EXISTS vector;` per database.
3. Drizzle ORM `>=0.31.0` for native `vector()` column type.

## Core concepts

### Mindset: vectors are derived data, not source data

- **Embeddings are computed artifacts** — derived from source text/images via an external model.
- **Never generate embeddings in the request path** — always async (pg-boss job, background worker).
- **Embeddings go stale** — when source data changes, the embedding must be recomputed.
- **The embedding model is a dependency** — changing models means re-embedding everything.
- **NULL embedding = not yet computed** — columns are nullable, queries filter `WHERE embedding IS NOT NULL`.

### Distance operators

| Operator | Distance | Use case | Index ops class |
|----------|----------|----------|----------------|
| `<=>` | Cosine distance | Text similarity (most common) | `vector_cosine_ops` |
| `<->` | L2 (Euclidean) | Spatial/geometric | `vector_l2_ops` |
| `<#>` | Inner product (negative) | When vectors are normalized | `vector_ip_ops` |

Cosine distance is the default for text and image embeddings. Use `1 - cosine_distance` for similarity score (0–1).

## Schema — Drizzle ORM

```typescript
import { index, pgTable, text, vector, timestamp } from 'drizzle-orm/pg-core';

export const listing = pgTable('listing', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  // Vector column — nullable because embeddings are async
  embedding: vector('embedding', { dimensions: 1536 }),
  embeddingModel: text('embedding_model'),          // track which model generated it
  embeddingUpdatedAt: timestamp('embedding_updated_at', { withTimezone: true }),
  // ...other columns
}, (table) => [
  // HNSW index — best for <1M rows, no training step
  index('listing_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
]);
```

## Index types

### HNSW (default choice)

- **Best for:** <1M rows, no training step needed, good recall.
- **Build:** Slower to build, faster to query.
- **Memory:** Higher memory usage.
- **Supports:** INSERT without rebuild.

```sql
CREATE INDEX listing_embedding_idx ON listing
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `m` | 16 | Max connections per node (higher = better recall, more memory) |
| `ef_construction` | 64 | Build-time search width (higher = better recall, slower build) |

Query-time setting: `SET hnsw.ef_search = 100;` (default 40, increase for better recall).

### IVFFlat (for >1M rows)

- **Best for:** >1M rows where build speed matters.
- **Requires:** Training step (needs existing data).
- **Build:** Faster to build, slower to query.

```sql
CREATE INDEX listing_embedding_ivfflat_idx ON listing
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);  -- sqrt(num_rows) is a good starting point
```

Query-time setting: `SET ivfflat.probes = 10;` (default 1, increase for better recall).

### Index strategy

1. Start with **no index** during development — exact search is fine for <10K rows.
2. Add **HNSW** when row count exceeds ~10K or query latency matters.
3. Switch to **IVFFlat** only if HNSW build time or memory is prohibitive (>1M rows).
4. Monitor recall: run exact search on sample queries and compare with ANN results.

## Embedding lifecycle — the critical architecture

### When to generate embeddings

```
Source data change → domain event → pg-boss job → embedding service → UPDATE row
```

| Trigger | Event | Job | What gets embedded |
|---------|-------|-----|--------------------|
| Listing created | `listing.created` | `generate-listing-embedding` | name + description + amenities |
| Listing updated (name/desc/amenities) | `listing.content_updated` | `generate-listing-embedding` | Re-embed with new content |
| Image uploaded | `listing_asset.created` | `generate-image-embedding` | Image via CLIP model |
| Backfill (migration) | Manual/cron | `backfill-embeddings` | All rows where embedding IS NULL |
| Model upgrade | Manual | `reembed-all` | All rows (new model, new dimensions) |

### Embedding service interface

```typescript
// packages/api/src/search/embedding-service.ts
export interface EmbeddingService {
  generateTextEmbedding(text: string): Promise<number[]>;
  generateImageEmbedding(imageUrl: string): Promise<number[]>;
  readonly model: string;
  readonly dimensions: number;
}
```

### pg-boss job handler

```typescript
// packages/api/src/search/jobs/generate-listing-embedding.ts
export async function handleGenerateListingEmbedding(
  job: { data: { listingId: string } },
  deps: { db: Database; embeddingService: EmbeddingService }
) {
  const listing = await deps.db.query.listing.findFirst({
    where: eq(schema.listing.id, job.data.listingId),
    with: { amenities: true },
  });
  if (!listing) return;

  const input = [listing.name, listing.description, 
    listing.amenities.map(a => a.label).join(', ')
  ].filter(Boolean).join('. ');

  const embedding = await deps.embeddingService.generateTextEmbedding(input);

  await deps.db.update(schema.listing)
    .set({
      embedding,
      embeddingModel: deps.embeddingService.model,
      embeddingUpdatedAt: new Date(),
    })
    .where(eq(schema.listing.id, listing.id));
}
```

### Staleness detection

```typescript
// Listing content changed after embedding was generated → stale
const staleListings = await db.select({ id: listing.id })
  .from(listing)
  .where(and(
    isNotNull(listing.embedding),
    gt(listing.updatedAt, listing.embeddingUpdatedAt)
  ));
// Queue re-embedding jobs for stale listings
```

## Query patterns — Drizzle ORM

Drizzle provides type-safe helpers for pgvector: `cosineDistance`, `l2Distance`, `innerProduct`,
`l1Distance`, `maxInnerProduct`. Use the `sql` operator only for BM25 / raw queries.

### Generating embeddings (OpenAI)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

export const generateEmbedding = async (value: string): Promise<number[]> => {
  const input = value.replaceAll('\n', ' ');
  const { data } = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input,
  });
  return data[0].embedding;
};
```

### Basic similarity search (type-safe)

`cosineDistance` returns the distance (0–2); use `1 - cosineDistance` for a similarity score (0–1).

```typescript
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';

async function searchListings(description: string, limit = 20) {
  const queryEmbedding = await generateEmbedding(description);
  const similarity = sql<number>`1 - (${cosineDistance(listing.embedding, queryEmbedding)})`;

  return db
    .select({ id: listing.id, name: listing.name, similarity })
    .from(listing)
    .where(gt(similarity, 0.5))
    .orderBy((t) => desc(t.similarity))
    .limit(limit);
}
```

### Pre-filtered similarity (org-scoped, active only)

```typescript
import { cosineDistance, desc, sql, eq, and, isNotNull } from 'drizzle-orm';

const results = await db
  .select({
    id: listing.id,
    name: listing.name,
    similarity: sql<number>`1 - (${cosineDistance(listing.embedding, queryEmbedding)})`,
  })
  .from(listing)
  .innerJoin(listingPublication, eq(listing.id, listingPublication.listingId))
  .where(
    and(
      isNotNull(listing.embedding),
      eq(listingPublication.channelType, 'platform_marketplace'),
      eq(listingPublication.isActive, true),
      eq(listing.status, 'active'),
    ),
  )
  .orderBy(sql`${cosineDistance(listing.embedding, queryEmbedding)}`)
  .limit(20);
```

### Hybrid search with BM25 (RRF fusion)

BM25 (`<@>` operator from pg_textsearch) has no Drizzle typed helper — use `db.execute(sql`...`)`.

```typescript
const hybridResults = await db.execute(sql`
  WITH keyword_results AS (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY description <@> to_bm25query(${query}, 'listing_desc_bm25_idx')
           ) AS rank_kw
    FROM listing
    ORDER BY description <@> to_bm25query(${query}, 'listing_desc_bm25_idx')
    LIMIT 20
  ),
  semantic_results AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY embedding <=> ${sql`${queryEmbedding}::vector`}) AS rank_vec
    FROM listing
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${sql`${queryEmbedding}::vector`}
    LIMIT 20
  )
  SELECT COALESCE(k.id, s.id) AS id,
         COALESCE(1.0 / (60 + k.rank_kw), 0.0) +
         COALESCE(1.0 / (60 + s.rank_vec), 0.0) AS rrf_score
  FROM keyword_results k
  FULL OUTER JOIN semantic_results s ON k.id = s.id
  ORDER BY rrf_score DESC
  LIMIT ${limit}
`);
```

## Testing strategy

### Embedding service mock

```typescript
class MockEmbeddingService implements EmbeddingService {
  readonly model = 'test-mock';
  readonly dimensions = 1536;

  async generateTextEmbedding(text: string): Promise<number[]> {
    return hashToVector(text, this.dimensions);
  }
  async generateImageEmbedding(imageUrl: string): Promise<number[]> {
    return hashToVector(imageUrl, 512);
  }
}

// Deterministic: same input → same vector. Preserves relative similarity.
function hashToVector(input: string, dims: number): number[] {
  const seed = hashCode(input);
  const rng = createSeededRng(seed);
  const vec = Array.from({ length: dims }, () => rng());
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map(v => v / norm);
}
```

### Test DB

- pgvector is a standard extension — available in most PG Docker images and CI.
- `CREATE EXTENSION IF NOT EXISTS vector;` in test setup migration.
- HNSW indexes are optional in test DB (exact search is fine for small test sets).

## Migration checklist

Drizzle doesn't auto-create extensions. Use a custom migration:

```sh
npx drizzle-kit generate --custom
```

```sql
-- 0001_extensions.sql (custom migration)
CREATE EXTENSION IF NOT EXISTS vector;
```

Then define vector columns in the Drizzle schema — `drizzle-kit generate` will pick them up:

```typescript
import { index, pgTable, serial, text, vector } from 'drizzle-orm/pg-core';

export const guides = pgTable(
  'guides',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    url: text('url').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
  },
  (table) => [
    index('embeddingIndex').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ],
);
```

After initial data load, build HNSW index concurrently in production:

```sql
CREATE INDEX CONCURRENTLY listing_embedding_idx
  ON listing USING hnsw (embedding vector_cosine_ops);
```

## Common dimension sizes

| Model | Dimensions | Use case |
|-------|-----------|----------|
| `text-embedding-3-small` (OpenAI) | 1536 | Text similarity (recommended) |
| `text-embedding-3-large` (OpenAI) | 3072 | Higher quality, more expensive |
| `text-embedding-ada-002` (OpenAI) | 1536 | Legacy, superseded by 3-small |
| CLIP ViT-B/32 | 512 | Image + text cross-modal |
| `all-MiniLM-L6-v2` (Sentence Transformers) | 384 | Self-hosted, fast, decent quality |

## Performance tips

- **Always use `LIMIT`** — ANN indexes optimize for top-k, not full scan.
- **Pre-filter before ANN** — reduce candidate set with B-tree indexes on org_id, status, etc.
- **Increase `ef_search`** for better recall at the cost of latency: `SET hnsw.ef_search = 100;`
- **Build index CONCURRENTLY** in production to avoid blocking writes.
- **Vacuum regularly** — deleted/updated rows leave dead tuples in the index.
- **Monitor recall** — compare ANN results with exact search on sample queries.
