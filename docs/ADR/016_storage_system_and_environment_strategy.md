# ADR-016: Storage System and Environment Strategy

**Date:** 2026-03-11
**Status:** Accepted
**Authors:** Platform Team
**Related:** [ADR-002: Architecture Patterns](./002_architecture-patterns.md), [ADR-008: Workspace Consolidation Constitution](./008_workspace_consolidation_constitution.md), [ADR-014: Admin Surface Composition and Resource Descriptors](./014_admin_surface_composition_and_resource_descriptors.md)

---

## Context

The repo has already introduced asset concepts, but not a storage system.

Current repo truth:

- `packages/db/src/schema/marketplace/listings.ts` stores `listing_asset.storage_key`, but not the storage backend or access model
- `packages/catalog/src/storefront-service.ts` returns `primaryImageKey`
- `apps/web/src/routes/(public)/listings/+page.svelte` and `apps/web/src/routes/(public)/listings/[id]/+page.svelte` build image URLs as `/assets/{key}`
- `apps/server` does not currently expose a matching `/assets/*` file-serving route
- there is no `packages/storage` package, no provider registry for storage, and no upload workflow yet

That means the code currently has an **asset pointer**, not a storage architecture.

We need a storage decision that works across the full lifecycle:

- local development
- package-level unit and integration tests
- browser E2E tests
- staging and production

We also need the abstraction to be coherent with how this repo already handles integrations:

- provider interface + registry pattern in payments
- adapter registry pattern in calendar
- startup registration in `apps/server/src/bootstrap.ts`

---

## External Reference Findings

### MedusaJS

Medusa separates file storage into:

- a generic file module
- a single active provider
- concrete provider implementations such as local filesystem and S3-compatible storage

Important behaviors from Medusa:

- the S3 provider is written against the AWS SDK and accepts a configurable `endpoint`, so it works with S3-compatible services, not just AWS
- the provider contract includes upload, delete, presigned download URL, presigned upload URL, stream upload, and buffer/stream reads
- the local filesystem provider has automated integration tests
- the S3 provider has real-network integration tests, but they are intentionally skipped by default and treated as manual or environment-gated

This is the right architectural pattern for this repo:

- keep the domain code unaware of R2, SeaweedFS, or any vendor SDK
- keep the adapter boundary generic enough that R2 is just one S3-compatible backend
- keep fast local tests off the network

Primary sources:

- [Medusa abstract file provider](https://github.com/medusajs/medusa/blob/develop/packages/core/utils/src/file/abstract-file-provider.ts)
- [Medusa file provider service](https://github.com/medusajs/medusa/blob/develop/packages/modules/file/src/services/file-provider-service.ts)
- [Medusa S3 provider](https://github.com/medusajs/medusa/blob/develop/packages/modules/providers/file-s3/src/services/s3-file.ts)
- [Medusa local file integration tests](https://github.com/medusajs/medusa/blob/develop/packages/modules/providers/file-local/integration-tests/__tests__/services.spec.ts)
- [Medusa S3 integration tests](https://github.com/medusajs/medusa/blob/develop/packages/modules/providers/file-s3/integration-tests/__tests__/services.spec.ts)

### Merkur

`mercurjs/mercur` is a downstream marketplace app built on Medusa. It uses Medusa's file module instead of inventing a separate storage layer.

Important behaviors from Merkur:

- S3 storage is enabled only when S3 environment variables are present
- uploads are handled through an app HTTP route using `multer.memoryStorage()`
- the route calls Medusa's `uploadFilesWorkflow` and marks uploaded vendor files as `public`
- Merkur does not appear to add dedicated storage E2E coverage beyond Medusa's provider model and its own normal backend integration harness

This is a useful downstream signal:

- the application layer should upload through a backend workflow or service boundary
- the storage provider should remain infrastructure-driven and environment-configured
- app-specific upload tests still need to be authored explicitly; a provider abstraction alone is not sufficient test coverage

Primary sources:

- [Merkur backend config](https://github.com/mercurjs/mercur/blob/main/apps/backend/medusa-config.ts)
- [Merkur vendor uploads route](https://github.com/mercurjs/mercur/blob/main/packages/modules/b2c-core/src/api/vendor/uploads/route.ts)
- [Merkur upload middleware](https://github.com/mercurjs/mercur/blob/main/packages/modules/b2c-core/src/api/vendor/uploads/middlewares.ts)

### SeaweedFS

SeaweedFS is an actively maintained open-source object store with S3 support and an explicit dev/test bootstrap path.

Important behaviors from SeaweedFS:

- the main repository is active and recent releases continue to ship S3 API fixes and features
- the documentation includes both Docker-based S3 quick starts and a single-command local start path
- recent releases added `weed mini`, explicitly positioned as convenient for beginners and test/dev environments
- `weed mini` starts a single-node stack including an S3 endpoint, which maps well to local development and Docker E2E

This makes SeaweedFS the preferred local S3-compatible analog for this repo.

Primary sources:

- [SeaweedFS repository](https://github.com/seaweedfs/seaweedfs)
- [SeaweedFS releases](https://github.com/seaweedfs/seaweedfs/releases)

---

## Decision

We will introduce a dedicated storage package and standardize storage by environment.

### 1. Storage sits behind a provider registry

Create `packages/storage` with the same integration posture already used in this repo for external systems:

- `provider.ts`
- `registry.ts`
- `adapters/s3.ts`
- `adapters/local-file.ts`
- `adapters/fake.ts`
- `index.ts`

Domain and app code must call the storage registry, not vendor SDKs directly.

R2 must not leak into domain logic.

### 2. The primary adapter contract is S3-compatible, not R2-specific

Cloudflare R2 is an S3-compatible backend.

The concrete network adapter should therefore be a generic S3 adapter configured with:

- `endpoint`
- `region`
- `bucket`
- `accessKeyId`
- `secretAccessKey`
- `publicBaseUrl`
- optional client flags for path-style or local emulation

This keeps the repo portable across:

- Cloudflare R2
- SeaweedFS
- AWS S3
- other compatible providers

### 3. Production and staging use Cloudflare R2

Production-like environments will use Cloudflare R2 as the object store.

Reasons:

- S3-compatible API
- custom public domains for media delivery
- no app-level coupling to VPS storage
- cleaner separation between compute and object storage
- better fit with the repo's existing Cloudflare and Pulumi footprint

R2 should be provisioned in Pulumi with:

- one or more buckets
- a public custom domain for public media
- typed secrets and endpoint values injected into app env

### 4. Local development and Docker E2E use SeaweedFS

Local and deploy-like test environments should not depend on live R2 credentials or external network access.

We standardize on SeaweedFS for:

- `docker-compose.yml`
- `docker-compose.e2e.yml`
- local full-stack development
- Playwright E2E

Reasons:

- S3 semantics close enough to production
- deterministic CI and local runs
- easy bucket bootstrapping in Docker
- supports presigned URL workflows and public object access patterns
- active open-source maintenance
- explicit support for test/dev usage

### 5. Unit and package-level integration tests stay local and fast

Fast tests must not require networked object storage.

We standardize on:

- `fake` provider for pure domain tests
- `local-file` provider backed by temporary directories for package-level integration tests
- optional environment-gated contract tests against SeaweedFS for the S3 adapter itself

This follows Medusa's split:

- local provider tests run automatically
- real S3 tests are explicit and environment-backed

### 6. Phase 1 uploads are server-mediated

Initial application uploads should go through the backend over `multipart/form-data`.

The backend should:

- validate auth and ownership
- validate file size and MIME type
- call the storage provider
- write the asset record and return the created asset DTO

This matches how Merkur uses Medusa's upload workflow and keeps the first version simple.

### 7. Presigned uploads are supported, but not the first integration path

The storage contract should include an optional `getPresignedUploadUrl` capability for future large-file or direct-browser upload flows.

However, the first app-facing implementation should use server-mediated uploads so that:

- authorization stays centralized
- E2E is easier to author
- we do not force direct-to-bucket complexity into the first implementation

### 8. Read models return URLs, not raw storage keys

Public-facing read models must return resolved URLs, not raw storage keys.

Specifically:

- storefront contracts should expose `primaryImageUrl`, not `primaryImageKey`
- public assets should resolve to a stable public media URL
- private assets should be accessed through signed URLs or a backend-issued download route

The web layer must not construct `/assets/{key}` by convention.

### 9. Asset records must persist enough storage identity for future migrations

At minimum, asset records must persist:

- `storageProvider`
- `storageKey`
- `access`

Recommended additional metadata:

- `byteSize`
- `checksum` or `etag`
- `originalFilename`

Persisted storage identity is required so that future backend migrations do not depend on a single global bucket assumption.

Provider identifiers should be logical and versionable, for example:

- `listing-public-v1`
- `listing-private-v1`

That allows future migrations without rewriting every call site.

---

## Environment Strategy

### Local development

Default posture:

- run SeaweedFS in Docker
- register the S3-compatible adapter against the local SeaweedFS S3 endpoint
- create public and private buckets on startup or in a bootstrap script
- use path-style S3 requests in local configuration

Optional fallback:

- allow `local-file` mode for quick no-Docker development

But parity-oriented local development should use SeaweedFS by default.

### Unit tests

Use the `fake` provider unless a test specifically needs file bytes on disk.

Unit tests must not talk to SeaweedFS, R2, or any external network.

### Package-level integration tests

Use `local-file` with temporary directories for:

- upload
- delete
- URL resolution
- signed URL fallback behavior where applicable

Add a separate contract suite for the S3 adapter that runs only when SeaweedFS env is present.

### Browser E2E

Extend the Docker E2E stack with SeaweedFS and bucket bootstrapping.

Playwright stories should exercise at least:

- authenticated upload of a listing image
- persistence of the created asset record
- render of the image on the public listing page
- deletion or replacement flow
- one private-file path if documents are introduced

E2E must not depend on live R2 credentials.

### Staging and production

Use R2 through the S3-compatible adapter.

Public assets should be served through a dedicated media domain.

Private assets should use short-lived signed URLs or a backend-controlled download endpoint.

---

## Testing Policy

We adopt the following storage test pyramid.

### 1. Adapter unit tests

`packages/storage`

- key generation and normalization
- content-type handling
- URL construction
- provider registration behavior
- fake provider semantics

### 2. Local-file integration tests

`packages/storage`

- upload writes file bytes
- delete removes file bytes
- public URL generation is stable
- optional stream-based upload path works

These should run in the default test suite.

### 3. S3 adapter contract tests

`packages/storage`

Environment-gated tests against SeaweedFS:

- upload public file
- upload private file
- signed download URL works
- delete works
- presigned upload works if enabled

These should be separate from the fast default test lane.

### 4. App integration tests

`apps/server` or package-level workflow tests

- multipart upload endpoint validates actor and file
- uploaded asset row is persisted with provider id and key
- response DTO contains resolved public URL

### 5. Playwright E2E

`packages/e2e-web`

- operator uploads an image
- image appears in admin or org UI
- image appears on the public listing page
- replacement or deletion updates the public surface correctly

Merkur's current repo shows that downstream application code often stops at the upload route. We explicitly do not accept that coverage level here.

---

## Consequences

### Positive

- storage becomes vendor-neutral at the application boundary
- production can use R2 without coupling the codebase to Cloudflare-specific APIs
- local and E2E environments become deterministic and do not require cloud secrets
- the frontend stops guessing asset URLs from raw keys
- future migrations between backends become possible

### Negative

- we add one more package and environment surface to maintain
- local Docker stacks gain a SeaweedFS service and bootstrap step
- schema and API contracts must change before upload UX is complete
- signed URL behavior must be handled explicitly for private assets

### Rejected alternatives

#### Direct R2 SDK calls in app code

Rejected because it couples business code to one provider and makes local and E2E parity harder.

#### MinIO as the default local S3 analog

Rejected because the upstream GitHub repository is archived and read-only as of 2026-02-13, so it is no longer an appropriate default dependency for new local and E2E infrastructure decisions.

#### LocalStack as the default local S3 analog

Rejected because this repo only needs object storage semantics for the first storage iteration, not broad AWS service emulation. It adds unnecessary surface area compared to a focused S3-compatible store.

#### 1GB object storage as the primary backend

Rejected as the primary direction because this repo already has stronger Cloudflare infrastructure alignment, and the application only needs S3 compatibility at the adapter boundary.

#### Filesystem-only storage everywhere

Rejected because it does not match production object-storage behavior and does not exercise presigned URL or bucket semantics.

---

## Implementation Outline

### Phase 1

- add `packages/storage`
- add env schema for storage configuration
- register storage provider in `apps/server/src/bootstrap.ts`
- add SeaweedFS to local and E2E Docker topology
- add R2 bucket and custom domain resources in Pulumi

### Phase 2

- add upload endpoint and storage service
- persist `storageProvider` and `access` in asset records
- switch storefront DTOs from `primaryImageKey` to `primaryImageUrl`
- stop constructing `/assets/{key}` in the web layer

### Phase 3

- add S3 contract tests against SeaweedFS
- add Playwright upload coverage
- add optional presigned upload flow for larger files

---

## Status After This ADR

This ADR defines the target architecture and environment policy.

It does not by itself implement:

- the storage package
- the DB migration
- the upload endpoint
- the SeaweedFS compose services
- the Pulumi R2 resources

Those changes should follow this ADR in implementation PRs.
