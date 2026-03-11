# Drizzle Mutation Patterns

Focused guidance for inserts, updates, deletes, upserts, and transactions in this repository.

---

## Repository conventions

- Put business mutations in the owning domain package, not in transport handlers.
- Use `returning()` whenever the next step depends on persisted state.
- Prefer database-backed idempotency keys over relying on request deduplication in application memory.
- Reach for a plain DB transaction when the change is local to the database.
- Reach for a workflow when the change coordinates DB writes with external providers, notifications, or compensation.

## Mutation checklist

1. What row or natural key makes this write idempotent?
2. Do multiple tables need to move together?
3. Does a later external step need a snapshot of values computed now?
4. Should timestamps come from application time (`new Date()`) or database time (`sql`now()`) for this field?
5. What test will prove the write is safe to retry?

## Inserts

```typescript
const [request] = await db
  .insert(bookingCancellationRequest)
  .values({
    id: crypto.randomUUID(),
    bookingId,
    organizationId,
    status: 'requested',
    requestedAt: new Date(),
  })
  .returning();
```

### Guidance

- Prefer explicit IDs in tests and seeded fixtures.
- Snapshot important financial values at request time if later workflow steps must not recalculate them.
- Store structured metadata in `jsonb()` columns, not stringified JSON blobs.

## Updates

```typescript
await db
  .update(booking)
  .set({
    status: 'cancelled',
    cancelledAt: new Date(),
    updatedAt: sql`now()`,
  })
  .where(eq(booking.id, bookingId));
```

### Guidance

- Use guarded `where(...)` clauses that encode the expected state when race conditions are possible.
- Prefer explicit state transitions over wide updates.
- If a mutation changes business state and audit state together, do both in the same transaction.

## Upserts and idempotency

```typescript
await db
  .insert(bookingRefund)
  .values({
    id: refundId,
    provider: 'policy',
    externalRefundId,
    bookingId,
    amountCents,
    currency,
  })
  .onConflictDoNothing({
    target: [bookingRefund.provider, bookingRefund.externalRefundId],
  });
```

### Guidance

- Use `onConflictDoNothing()` when a real uniqueness constraint expresses retry safety.
- Use `onConflictDoUpdate()` when newer writes are intentionally authoritative.
- Do **not** use upsert as a band-aid for missing uniqueness design.

## Transactions

```typescript
const result = await db.transaction(async (tx) => {
  const [updatedRequest] = await tx
    .update(bookingCancellationRequest)
    .set({ status: 'applied', appliedAt: new Date() })
    .where(eq(bookingCancellationRequest.id, requestId))
    .returning();

  await tx
    .update(booking)
    .set({ status: 'cancelled', updatedAt: sql`now()` })
    .where(eq(booking.id, updatedRequest.bookingId));

  return updatedRequest;
});
```

### Guidance

- Group multi-table state changes in a single transaction.
- Compute values before entering the transaction when they do not depend on row locks.
- If a transaction is followed by an external call, consider whether a workflow is the safer abstraction.

## Delete strategies

- Prefer explicit lifecycle states over hard deletes for business entities.
- Hard delete is appropriate for pure join rows, ephemeral tables, or test cleanup.
- For user-visible records, decide on retention and audit requirements before introducing `delete()`.

## Timestamp guidance in writes

- `new Date()` is appropriate for application-level event timestamps and deterministic tests.
- `sql`now()` is appropriate when the database should author the final update instant.
- Do not use JS `Date` for calendar-only concepts such as “booking day” or “billing date”; persist those as `date(..., { mode: 'string' })`.

## When to escalate to a workflow

Use a workflow instead of a naked transaction when the mutation also:

- calls a payment provider
- pushes calendar changes
- emits notifications/events that may need compensation
- has rollback-sensitive multi-step behavior

Examples in this repo:

- `packages/booking/src/cancellation/cancellation-workflow.ts`
- `packages/booking/src/cancellation-service.ts` for pre-workflow request creation and snapshotting
