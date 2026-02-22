# Current State (As Implemented)

Snapshot date: 2026-02-22

## Scope
This is the **actual implemented state** of the YouTube playtest subsystem in this repo (not target architecture).

## Monorepo Modules Involved
- `packages/db`: Drizzle schema + migrations (`yt_feed`, `yt_video`, `yt_transcript`, `yt_signal`, `yt_cluster`)
- `packages/api`: oRPC contracts + routers (`youtube.*`)
- `packages/youtube`: Node utilities (`search`, `metadata`, `subtitles`, `download-audio`, `transcribe`)
- `packages/assistant`: assistant router + YouTube tools that call server oRPC
- `apps/server`: queue consumers + queue routing
- `packages/infra`: Cloudflare resources (D1, R2, queues, Vectorize binding)
- `apps/web`: YouTube feeds/videos/insights UI routes

## Domain Schema (D1)

### Tables
- `yt_feed`: search feed config per org/game
  - key fields: `name`, `gameTitle`, `searchQuery`, `stopWords`, `publishedAfter`, `gameVersion`, `scheduleHint`, `status`, `lastDiscoveryAt`
- `yt_video`: discovered/submitted videos
  - key fields: `feedId`, `youtubeVideoId`, metadata fields, `status`, review fields, ingest/failure fields
  - unique: `(feed_id, youtube_video_id)`
- `yt_transcript`: transcript artifacts per video
  - key fields: `source`, `language`, `r2Key`, `fullText`, `durationSeconds`, `segmentCount`, `tokenCount`
- `yt_signal`: atomic NLP feedback units
  - key fields: `type`, `severity`, `text`, `contextBefore/After`, `timestampStart/End`, `confidence`, `component`, `gameVersion`, `clusterId`, `vectorized`, `embeddingModel`
- `yt_cluster`: grouped issues/insights
  - key fields: `title`, `summary`, `state`, `type`, `severity`, `signalCount`, `uniqueAuthors`, `impactScore`, version fields, external issue link/id

### Enums
- Feed status: `active | paused | archived`
- Video status: `candidate | approved | rejected | ingesting | ingested | failed`
- Transcript source: `youtube_captions | whisper_asr | manual`
- Signal type: `bug | ux_friction | confusion | praise | suggestion | performance | crash | exploit | other`
- Severity: `critical | high | medium | low | info`
- Cluster state: `open | acknowledged | in_progress | fixed | ignored | regression`

### Data Model Diagram
```mermaid
erDiagram
  ORGANIZATION ||--o{ YT_FEED : owns
  ORGANIZATION ||--o{ YT_VIDEO : owns
  ORGANIZATION ||--o{ YT_TRANSCRIPT : owns
  ORGANIZATION ||--o{ YT_SIGNAL : owns
  ORGANIZATION ||--o{ YT_CLUSTER : owns

  YT_FEED ||--o{ YT_VIDEO : contains
  YT_VIDEO ||--o{ YT_TRANSCRIPT : has
  YT_VIDEO ||--o{ YT_SIGNAL : has
  YT_TRANSCRIPT ||--o{ YT_SIGNAL : yields
  YT_CLUSTER ||--o{ YT_SIGNAL : groups

  USER o|--o{ YT_VIDEO : reviews
```

## API / Assistant Surface

### oRPC (`packages/api/src/routers/youtube/index.ts`)
- Feeds: `create`, `update`, `list`, `delete`
- Videos: `submit`, `review`, `list`, `triggerDiscovery`
- Signals: `list`
- Clusters: `list`, `updateState`
- Search: `semantic` (currently LIKE-based fallback)

### Assistant tools (`packages/assistant/src/tools/youtube/*`)
- `ytSearchSignals`, `ytSearchYouTube`
- `ytListVideos`, `ytListClusters`
- `ytSubmitVideo`, `ytTriggerDiscovery`, `ytUpdateClusterState`

## Infrastructure / Runtime Wiring

### Provisioned resources (`packages/infra/alchemy.run.ts`)
- D1 DB
- R2 bucket: `yt-transcripts`
- Queues + DLQ:
  - `yt-discovery`, `yt-ingest`, `yt-vectorize`, `yt-nlp`, `yt-transcribe`
- Vectorize index: `yt-signals` (1536 dims, cosine)

### Consumers (`apps/server/src/queues`)
- `yt-discovery-consumer`: validates message, loads feed, updates `lastDiscoveryAt` (search/insert not yet implemented)
- `yt-ingest-consumer`: placeholder ingest flow; creates transcript; dispatches to transcribe or nlp/vectorize
- `yt-transcribe-consumer`: reads audio from R2; placeholder transcript update; dispatches nlp/vectorize
- `yt-nlp-consumer`: placeholder signal extraction (creates one placeholder signal)
- `yt-vectorize-consumer`: marks signals as vectorized (embedding/upsert placeholder)

### Runtime Flow Diagram (Current)
```mermaid
graph TD
  U[Web UI] --> RPC[Server oRPC]
  A[Assistant Worker] -->|tool calls| RPC

  RPC --> D1[(D1: yt_* tables)]
  RPC -->|triggerDiscovery| QD[YT_DISCOVERY_QUEUE]

  QD --> C1[yt-discovery-consumer]
  C1 --> D1

  QI[YT_INGEST_QUEUE] --> C2[yt-ingest-consumer]
  C2 --> D1
  C2 --> R2[(R2 yt-transcripts)]
  C2 --> QT[YT_TRANSCRIBE_QUEUE]
  C2 --> QV[YT_VECTORIZE_QUEUE]
  C2 --> QN[YT_NLP_QUEUE]

  QT --> C3[yt-transcribe-consumer]
  C3 --> R2
  C3 --> D1
  C3 --> QV
  C3 --> QN

  QN --> C4[yt-nlp-consumer]
  C4 --> D1

  QV --> C5[yt-vectorize-consumer]
  C5 --> D1
  C5 -. placeholder .-> V[(Vectorize)]
```

## What Is Present vs Placeholder
- Implemented:
  - Strong base schema for feeds/videos/transcripts/signals/clusters
  - Org-scoped permissions for YouTube resources
  - Queue contracts and consumers with retry/ack patterns
  - UI pages for feeds/videos/insights
  - Assistant tools wired to oRPC
- Placeholder / not fully wired:
  - No FTS5 virtual table yet (search uses `LIKE`)
  - Semantic search endpoint is not vector search yet
  - Discovery consumer does not persist candidates from YouTube search yet
  - NLP/vector/transcribe are scaffolded with placeholder logic
  - No cluster queue/consumer implemented
  - `triggerDiscovery` expects `context.ytDiscoveryQueue`, but API context currently only wires notification/recurring queues
  - `videos.review(approve)` does not enqueue ingest automatically
