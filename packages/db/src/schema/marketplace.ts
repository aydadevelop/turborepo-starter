/**
 * Draft marketplace schema.
 *
 * Search-extension-dependent fields/indexes (pgvector / pg_textsearch / earthdistance)
 * are intentionally omitted from the exported runtime schema for now because the current
 * test setup uses PGlite and pushes the full schema in-memory. Add those columns/indexes
 * in a later phase once the test harness supports extension-aware Postgres.
 */

export * from "./marketplace/bookings";
export * from "./marketplace/listings";
export * from "./marketplace/organization";
export * from "./marketplace/payments";
export * from "./marketplace/pricing";
export * from "./marketplace/publications";
export * from "./marketplace/reviews";
export * from "./marketplace/shared";
export * from "./marketplace/staffing";
