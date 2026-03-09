# Feature Landscape

**Domain:** Travel-commerce listing marketplace (brownfield extraction into active monorepo)
**Researched:** 2026-03-09
**Confidence:** HIGH — based on `PROJECT.md`, ADR-000, schema planning docs, and current codebase concerns.

## Scope framing

This v1 is **not** a greenfield “launch fast and tidy later” product slice. It is a **brownfield parity-preserving extraction** into the active marketplace monorepo. That means some capabilities that might look like internal plumbing in a greenfield app are actually **user-facing enabling features** here, because without them the team cannot safely port, verify, or evolve the marketplace.

In particular, the following are **table stakes**, not optional cleanup:
- reproducible schema baseline and migrations
- deterministic seeds / replayable snapshots
- migration-parity work against proven legacy marketplace behavior

If those are skipped, every downstream feature becomes harder to trust, demo, or ship.

## Table stakes for v1

Features users and operators will reasonably expect from a serious v1 marketplace, plus the brownfield-enabling capabilities required to make that v1 credible.

| Feature | Why it is table stakes for this repo | Dependencies | Complexity | Notes |
|---------|--------------------------------------|--------------|------------|-------|
| **Schema baseline, committed migrations, and extension-aware verification** | This repo is explicitly schema-first and brownfield. Without a locked baseline, the marketplace cannot be extracted safely or replayed across environments. | Existing `packages/db` foundation, Postgres/Drizzle setup | High | Treat as the first deliverable, not cleanup. This unlocks booking, pricing, availability, and payment work. |
| **Deterministic seeds, state snapshots, and fixture replay** | Brownfield extraction needs repeatable states for real marketplace flows: orgs, listings, bookings, payments, and support cases. | Baseline migrations, DB scripts, test harness updates | High | Seeds and snapshots are product-enabling because they make parity, demos, and incident reproduction possible. |
| **Migration-parity verification for core legacy behavior** | The repo is intentionally inheriting domain truth from legacy systems. Parity work is required so v1 preserves proven booking/payment semantics instead of re-inventing them incorrectly. | Seeds/snapshots, domain-by-domain extraction, tests | High | Start with catalog/pricing semantics, then booking lifecycle, then payment/calendar/support. |
| **Multi-org auth, org context, and RBAC-safe operator access** | Marketplace operations depend on org isolation, staff roles, and customer membership boundaries. This is fundamental, not a nice-to-have. | Better Auth org foundation, session context, org middleware | Medium | Much of the foundation exists already, but v1 must rely on it consistently for all marketplace domains. |
| **Generic listing and publication management** | Operators need to create, maintain, and publish bookable inventory that is not boat-only. Without this, there is no marketplace supply. | Schema baseline, org RBAC, listing-type configuration, asset/location modeling | High | Includes listing types, listing metadata, assets, location, status, and publication to the marketplace channel. |
| **Public storefront discovery and listing detail flow** | Customers must be able to browse published listings, inspect details, and understand whether the marketplace is worth booking through. | Listing/publication model, public contract routes, basic search/filter | Medium | v1 only needs pragmatic browse/search/filter/detail, not sophisticated retrieval or merchandising. |
| **Availability management with booking-safety guarantees** | A time-slot marketplace fails immediately if inventory can be double-booked or availability cannot be trusted. | Listings, availability rules/blocks, booking overlap protection, timezone handling | High | Internal availability and conflict prevention are table stakes. External calendar sync can be deferred if parity does not require it immediately. |
| **Pricing and quote generation** | Travel-commerce customers expect transparent quote breakdowns before booking, and operators need configurable fees and pricing profiles. | Listings, publications, pricing profiles/rules, fee resolution, currency handling | High | Includes base price, service/tax/deposit logic, and quote calculation. Avoid gold-plating pricing before core scenarios work. |
| **Booking intake and lifecycle baseline** | The marketplace must let customers request/book time slots and let operators manage status transitions reliably. | Listings, availability, pricing, auth/customer identity, notifications | Very High | At minimum: create booking, view booking, confirm/reject/cancel, move through active/completed states, and preserve audit-worthy state. |
| **Payment processing with webhook reconciliation** | A v1 commerce marketplace without reliable payment capture and reconciliation is not really commerce—just hopeful scheduling. | Booking lifecycle, organization payment config, provider adapter, webhook logging, idempotency | Very High | One provider path is enough for v1 if it is robust. Multi-provider breadth is not required yet. |
| **Confirmation, cancellation, and support communication baseline** | Operators and customers need operational confidence after booking: confirmations, updates, support contact, and basic issue handling. | Booking events, notification pipeline, support ticket/message baseline | Medium-High | The existing notification foundation is a strong start. Keep transport thin and domain-triggered. |
| **Cancellation policy and refund-capable core flows** | Travel-commerce bookings inherently need a path for cancellations and money adjustments, even if advanced dispute automation is deferred. | Booking, pricing snapshots, payment attempts/refunds, policy modeling | High | Support simple, reliable cancellation/refund paths before adding elaborate dual-approval or dispute workflows. |

## Differentiators to defer unless explicitly needed

Useful features, but not required to prove the brownfield marketplace v1. These should wait unless they are demanded by legacy parity, an immediate commercial requirement, or a specific milestone goal.

| Feature | Why defer it | Dependencies | Complexity | Notes |
|---------|--------------|--------------|------------|-------|
| **AI assistant for customer booking and operator tooling** | The repo already has assistant infrastructure, but marketplace-grade tools depend on stable listing, availability, booking, and org context first. | Stable contracts, org-scoped assistant context, search, booking tools | High | Great differentiator later; risky distraction now. Cute robots should wait until bookings stop biting. |
| **Semantic/BM25/image search stack** | Advanced retrieval improves discovery, but v1 can ship with simpler browse/filter/search over published listings. | Stable listing corpus, Postgres extensions, embeddings pipeline | High | Keep search relevant, but do not block v1 on pgvector/pg_textsearch sophistication. |
| **External calendar sync (Google/Outlook/iCal) and bi-directional sync workflows** | Valuable for operator adoption, but v1 only needs trustworthy internal availability unless a parity-critical cohort requires sync immediately. | Availability core, booking events, provider adapters, webhook handling | High | Defer integration breadth; keep the internal availability model strong first. |
| **Partner-site / widget / white-label distribution breadth** | Multi-channel distribution is part of the long-term architecture, but platform marketplace + one owned publication path is enough for v1 proof. | Publication model, payment routing variants, branding/config layers | Medium-High | Start with the marketplace channel; add partner widgets when supply/distribution strategy is explicit. |
| **Affiliate attribution and automated payouts** | Helpful for growth, but not required to validate supply, demand, booking, and payment fundamentals. | Booking events, payout logic, tracking data, finance ops | Medium-High | Good later-phase monetization feature, not a day-one necessity. |
| **Review and trust system with moderation and owner responses** | Reviews help conversion, but can be deferred until the core transaction loop is reliable and enough completed bookings exist to justify moderation overhead. | Completed bookings, auth, moderation workflow, storefront display | Medium | Add once the booking engine is stable and post-booking engagement matters. |
| **Advanced shift/reschedule approval workflows** | Useful operationally, but reliable cancel/rebook is enough for initial v1 unless legacy parity explicitly depends on reschedule semantics. | Booking lifecycle, pricing deltas, payment adjustment flows | High | Prefer simpler operator-managed changes before automating dual-party approvals. |
| **Dispute automation and chargeback case management** | Important at scale, but not required to stand up the first credible marketplace transaction flow. | Payment reconciliation, refund tracking, backoffice tooling | Medium-High | Start with webhook logging and manual ops support; automate later if volume justifies it. |
| **Storefront theming / multi-domain brand experience** | Nice for commercial flexibility, but not necessary to prove the generic marketplace core. | Publication/storefront model, organization settings, asset theming | Medium | Defer until there is a real white-label requirement. |

## Anti-features to keep out of v1

These capabilities actively dilute focus, reintroduce rejected assumptions, or create more surface area than the current milestone can safely support.

| Anti-feature | Why it should stay out | What to do instead |
|--------------|------------------------|--------------------|
| **Boat-only core abstractions** | The project explicitly rejects boat-only domain modeling in the active runtime. Hard-coding one asset type would poison the marketplace boundary from day one. | Build around generic listings with type configuration and validated metadata. |
| **Wholesale legacy cloning into active packages** | Direct copy would reintroduce old side-effect patterns and wrong package boundaries, making later extraction more expensive. | Port behavior selectively with parity tests and current package seams. |
| **Mobile-native clients in the initial milestone** | The project scope explicitly says web and API first. Native clients would multiply surface area without proving core commerce reliability. | Keep v1 web-first and contract-first. |
| **Recurring bookings / recurrence templates** | ADR-000 explicitly marks recurring bookings as not needed. Supporting them early would complicate availability, pricing, and UX. | Support one-off time-slot bookings only. |
| **Waitlists for full slots** | Also explicitly marked as unnecessary. Waitlists add coordination logic before the baseline booking flow is proven. | Focus on accurate availability and clear alternatives. |
| **Full CRM / marketing automation suite** | A marketplace core is not improved by stuffing in campaign tooling before booking, payment, and support are stable. | Reuse the notification pipeline for transactional messaging only. |
| **Multi-provider payment matrix at launch** | Payment breadth creates integration drag without improving the proof of core booking commerce. | Ship one robust provider path with clean adapter seams. |
| **Elasticsearch/Algolia-style external search infra before product fit** | Extra infrastructure would mask unresolved listing, pricing, and publication semantics. | Start with pragmatic Postgres-backed discovery and add advanced search only when justified. |
| **Full white-label site-builder or theming studio** | This turns a marketplace extraction into a platform-product detour. | Keep storefront presentation functional and restrained. |
| **Speculative gamification, loyalty, wishlist, or social layers** | These do not help prove core supply → discovery → booking → payment → support reliability. | Reserve later roadmap space for proven conversion or retention needs. |

## Feature dependencies

The safest path is dependency-driven, not excitement-driven.

```text
Schema baseline + committed migrations
  → deterministic seeds / state snapshots
  → migration-parity fixtures and verification
  → generic listing + publication model
  → storefront discovery
  → availability safety
  → pricing + quote generation
  → booking lifecycle
  → payment capture + webhook reconciliation
  → notifications / support / cancellation flows

Stable listing + booking + org context
  → external calendar sync
  → reviews
  → affiliate attribution
  → assistant tools
  → advanced search
  → partner / widget / white-label distribution
```

## Complexity notes by major category

| Category | Complexity | Why |
|----------|------------|-----|
| Brownfield safety baseline (migrations, seeds, parity) | High | It touches schema history, testability, and every downstream milestone. |
| Catalog / listings / publication | High | Needs generic modeling without slipping back into boat-specific assumptions. |
| Availability + booking safety | High | Timezone handling, overlap prevention, and state correctness are unforgiving. |
| Pricing + payments | Very High | Money, fee resolution, webhook idempotency, and refunds raise the cost of mistakes. |
| Notifications + support | Medium-High | Existing foundations help, but domain-triggered behavior still needs careful wiring. |
| Advanced search / AI / external integrations | High | These are powerful, but they sit on top of stable domain semantics rather than replacing them. |

## MVP recommendation

Prioritize this v1 in order:
1. **Brownfield safety baseline** — schema baseline, committed migrations, deterministic seeds/snapshots, parity harness.
2. **Supply model** — generic listings, publications, operator-safe org/RBAC behavior.
3. **Commerce core** — availability, pricing, booking lifecycle, payment reconciliation.
4. **Operational reliability** — notifications, cancellation/refund baseline, support handling.

Defer until explicitly needed:
- assistant-led booking
- semantic/vector/BM25-heavy search
- partner/widget distribution breadth
- affiliate automation
- review system
- advanced reschedule/dispute automation

## Bottom line

For this repository, **v1 table stakes are not just customer-visible screens**. They also include the brownfield-enabling capabilities that make extraction safe and parity measurable. The winning focus is:

**reproducible schema + replayable states + generic listings + trustworthy availability/pricing/booking/payment flows**.

Everything else should earn its way in.
