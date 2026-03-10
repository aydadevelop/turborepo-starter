# Phase 08: verification-traceability-backfill — Research

**Researched:** 2026-03-10
**Domain:** Audit evidence backfill, summary frontmatter repair, requirements traceability sync
**Confidence:** HIGH — findings verified against live workspace docs, phase plans, existing summaries, and milestone audit artifacts

## Summary

Phase 08 is **not** a product-feature phase. It is a **documentation and traceability repair phase** whose job is to make already-delivered work auditable under the repo’s 3-source rule:

1. phase `*-VERIFICATION.md` exists and marks the requirement satisfied,
2. the relevant `*-SUMMARY.md` frontmatter lists the requirement under `requirements-completed`, and
3. `.planning/REQUIREMENTS.md` marks the requirement status accurately.

No new runtime libraries are needed. The correct implementation approach is to **reuse the existing GSD summary/verification patterns**, backfill machine-readable metadata into historical summaries, create missing phase-level verification reports for Phases 03-07, then update `REQUIREMENTS.md` and regenerate the milestone audit so bookkeeping stops lagging behind delivered work.

**Primary recommendation:** Treat Phase 08 as an **evidence-chain repair** project. Do not change product code. Do not manufacture new requirement completions. Only claim requirements that the existing phase outputs and tests already prove.

---

## Standard Stack

### Core tools and files already in the workspace

| Tool / File | Purpose | How Phase 08 should use it |
|---|---|---|
| `.github/get-shit-done/templates/summary.md` | Canonical summary frontmatter shape | Backfill missing summary frontmatter fields; use `requirements-completed` exactly as named |
| `.github/get-shit-done/templates/verification-report.md` | Canonical verification report sections | Use as a section checklist, but keep the final report aligned with the table-oriented style already used by `01-VERIFICATION.md` and `02-VERIFICATION.md` |
| `.github/get-shit-done/workflows/execute-plan.md` | Summary creation rules | Follow its rule that `requirements-completed` must copy the plan’s requirement ownership verbatim where applicable |
| `.github/get-shit-done/workflows/audit-milestone.md` | 3-source satisfaction rule | Use it as the source of truth for what the milestone audit will consider satisfied vs partial/orphaned |
| `node .github/get-shit-done/bin/gsd-tools.cjs summary-extract` | Machine-read summary frontmatter | Verify that backfilled summaries expose `requirements_completed` correctly |
| `.planning/v1.0-v1.0-MILESTONE-AUDIT.md` | Gap inventory and evidence baseline | Use as the authoritative list of bookkeeping gaps Phase 08 exists to close |
| `01-VERIFICATION.md`, `02-VERIFICATION.md` | Existing in-repo verification exemplars | Mirror their table-oriented structure for the newly created 03-07 verification files |
| `02-01-SUMMARY.md` | Existing in-repo summary exemplar | Reuse its frontmatter layout as the “known-good” model |

### No new dependencies

Phase 08 requires **zero** new npm packages, no schema changes, and no runtime service wiring. This is a repo-internal process/documentation phase.

### Useful command set

Use these commands as the default verification stack:

```bash
node .github/get-shit-done/bin/gsd-tools.cjs summary-extract <summary-path> --fields requirements_completed

grep -q 'CATL-03' .planning/phases/03-org-access-catalog-storefront/03-VERIFICATION.md

test -f .planning/phases/04-availability-pricing-core/04-VERIFICATION.md
```

For Phase 08 specifically, the existing plan files already contain the exact verification commands to reuse:
- `08-01-PLAN.md`
- `08-02-PLAN.md`
- `08-03-PLAN.md`

---

## Architecture Patterns

### Pattern 1: Think in evidence chains, not feature delivery

Every Phase 08 change should answer one question:

> “What missing evidence prevents the audit from recognizing work that already exists?”

That means the implementation unit is not “screen” or “API.” It is one of:
- summary frontmatter repair,
- verification report creation,
- traceability status sync,
- milestone audit refresh.

### Pattern 2: Preserve requirement ownership decisions from the post-audit remediation plan

The roadmap and Phase 08 plans already narrowed which requirements Phase 08 should claim:
- Phase 01 backfill → `PLAT-01`, `PLAT-02`, `PLAT-03`, `PLAT-04`
- Phase 03 backfill → `CATL-03`, `CATL-04`
- Phase 04 backfill → `AVPR-01`, `AVPR-02`, `AVPR-04`
- Phase 05 backfill → `BOOK-02`
- Phase 06 → verified historical context only, **no still-open requirement claims**
- Phase 07 → extraction verification for `EXTR-01` through `EXTR-04`

Do **not** re-claim requirements that were intentionally moved to Phases 09-11.

### Pattern 3: Summary frontmatter is the machine-readable contract

The summary key is:

```yaml
requirements-completed:
  - CATL-03
  - CATL-04
```

Important nuance:
- In markdown/YAML, the key is **`requirements-completed`** (hyphenated).
- In `gsd-tools summary-extract`, the returned JSON field is **`requirements_completed`** (underscored).

This mismatch is intentional in current tooling. Do not “fix” it by renaming the YAML key.

### Pattern 4: Use `requirements-completed: []` when the summary should be machine-readable but should not claim ownership

This is the correct pattern for summaries such as:
- `03-01-SUMMARY.md`
- `03-02-SUMMARY.md`
- `04-03-SUMMARY.md`
- `05-01-SUMMARY.md`
- `05-03-SUMMARY.md`
- all three Phase 06 summaries

Empty arrays are valid and are explicitly supported by the repo’s summary template and Phase 08 plans.

### Pattern 5: New verification reports should match the repo’s live house style

There are two relevant sources:
- the generic template in `.github/get-shit-done/templates/verification-report.md`
- the actual live reports in `01-VERIFICATION.md` and `02-VERIFICATION.md`

For Phase 08, prefer the **actual in-repo table-oriented report style** used by Phases 01 and 02, because the milestone audit already references those files as the baseline evidence format.

Recommended section pattern:
- phase goal / requirements header
- must-have truths or equivalent evidence tables
- artifact verification
- key links verification
- automated test results / evidence summary
- requirements coverage
- phase goal assessment

Do **not** invent a third report style.

### Pattern 6: Update the audit by rerunning the workflow logic, not by polishing prose

`08-03` exists to convert repaired evidence into visible milestone status. The correct order is:

1. backfill summaries,
2. create missing verification files,
3. update `REQUIREMENTS.md` statuses,
4. refresh `.planning/v1.0-v1.0-MILESTONE-AUDIT.md` based on the repaired evidence chain.

The audit report is the output of the evidence update, not a hand-written narrative cleanup task.

### Pattern 7: Keep Phase 08 out of runtime code

Files touched by Phase 08 should remain inside:
- `.planning/phases/**`
- `.planning/REQUIREMENTS.md`
- `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`

If an implementation starts editing `packages/` or `apps/`, it is almost certainly doing the wrong phase.

---

## Don't Hand-Roll

| Problem | Don’t do this | Use instead | Why |
|---|---|---|---|
| Summary metadata repair | Add ad hoc YAML keys or partial frontmatter | Follow `.github/get-shit-done/templates/summary.md` and `02-01-SUMMARY.md` | `summary-extract` only knows the established shape |
| Verification report creation | Invent a new one-off prose format | Mirror `01-VERIFICATION.md` / `02-VERIFICATION.md` table structure | Keeps audit evidence consistent across phases |
| Requirement claiming | Infer claims from “phase probably did X” | Claim only what the plans, summaries, tests, and prior audit evidence already support | Prevents fake positives |
| Traceability sync | Reassign phase ownership again | Only update the **Status** column in `REQUIREMENTS.md` for requirements already rehomed by the roadmap | Phase 08 is bookkeeping repair, not roadmap redesign |
| Milestone audit refresh | Hand-edit conclusions to look better | Rebuild the report from repaired verification + summary + traceability data | The whole point is truthful auditability |
| Phase 06 cleanup | Mark Phase 06 requirements as satisfied to improve the score | Keep Phase 06 summaries machine-readable with `requirements-completed: []` | Phase 06 has useful verified artifacts but its live-path requirements moved to Phases 10-11 |

---

## Common Pitfalls

### Pitfall 1: Using the wrong summary key

**What goes wrong:** Writing `requirements_completed:` in YAML because the CLI outputs that field name.

**Correct approach:** The YAML/frontmatter key must be:

```yaml
requirements-completed:
```

The underscore form is CLI output only.

### Pitfall 2: Over-claiming requirements that were explicitly deferred

**What goes wrong:** Claiming `AUTH-01`, `CATL-01`, `CATL-02`, `BOOK-01`, `BOOK-03`, `BOOK-04`, `BOOK-05`, `OPER-01`, or `OPER-02` inside Phase 08 because the underlying phase touched related code.

**Correct approach:** Respect the post-audit ownership split. Phase 08 only repairs the requirements listed in the Phase 08 plan frontmatter. The remaining live-path work stays in Phases 09-11.

### Pitfall 3: Treating “phase complete” as evidence

**What goes wrong:** Assuming a completed phase automatically satisfies the audit.

**Evidence from the current audit:** The existing milestone audit explicitly marks Phases 03-07 as gaps because they have no `*-VERIFICATION.md`, even though the phases are marked complete in planning artifacts.

**Correct approach:** A phase is auditable only when the verification file exists and the summary frontmatter exposes requirement claims machine-readably.

### Pitfall 4: Updating `REQUIREMENTS.md` before the evidence exists

**What goes wrong:** Marking rows as `Satisfied` first, then planning to add the verification later.

**Correct approach:** Do the evidence backfill first. `REQUIREMENTS.md` status should be the last bookkeeping step before rerunning the milestone audit.

### Pitfall 5: Forgetting that empty requirement claims are valid

**What goes wrong:** Omitting frontmatter from summaries that should claim nothing, because “empty means not needed.”

**Correct approach:** Use full frontmatter plus `requirements-completed: []`. This keeps the file machine-readable and avoids future audit ambiguity.

### Pitfall 6: Hand-editing the audit into a “pass” story

**What goes wrong:** Rewriting `.planning/v1.0-v1.0-MILESTONE-AUDIT.md` conclusions without grounding them in the repaired source files.

**Correct approach:** The refreshed report may still remain `gaps_found` overall. Phase 08 succeeds when **bookkeeping-only false negatives disappear**, not when all milestone gaps vanish.

### Pitfall 7: Mixing verification template semantics with existing report semantics

**What goes wrong:** Blindly scaffolding a verification file from the generic template and leaving it in a shape that does not resemble the existing Phase 01 / 02 reports.

**Correct approach:** If you use the template as a drafting aid, normalize the final file to the same practical evidence-table style already used in the repo.

---

## Code Examples

### 1. Correct summary frontmatter claim

```yaml
---
phase: 03-org-access-catalog-storefront
plan: 03
subsystem: storefront
requirements-completed:
  - CATL-03
  - CATL-04
---
```

### 2. Correct empty claim for machine-readable-but-non-owning summary

```yaml
---
phase: 06-payments-notifications-support
plan: 01
subsystem: payments
requirements-completed: []
---
```

### 3. Verify repaired summary frontmatter via CLI

```bash
node .github/get-shit-done/bin/gsd-tools.cjs summary-extract \
  .planning/phases/05-booking-core-customer-access/05-02-SUMMARY.md \
  --fields requirements_completed
```

Expected output includes:

```json
{
  "requirements_completed": ["BOOK-02"]
}
```

### 4. Minimal verification report shape to mirror existing reports

```markdown
---
phase: 04-availability-pricing-core
status: passed
verified: 2026-03-10
---

# Phase 04: Verification Report

**Phase Goal**: Availability and pricing outcomes are auditable.
**Requirements**: AVPR-01, AVPR-02, AVPR-04

## Must-Have Truths

| Truth | Status | Evidence |
|-------|--------|----------|
| Operator-managed availability rules are present and tested | ✅ Passed | 04-01 summary + cited tests |

## Requirements Coverage

| Req ID | Description | Plan | Status |
|--------|-------------|------|--------|
| AVPR-01 | ... | 04-01 | ✅ Done |
```

### 5. Exact requirements that Phase 08 should mark satisfied in `REQUIREMENTS.md`

```text
PLAT-01
PLAT-02
PLAT-03
PLAT-04
PLAT-05
CATL-03
CATL-04
AVPR-01
AVPR-02
AVPR-04
BOOK-02
```

Notes:
- `PLAT-05` remains Phase 02-owned and should be marked `Satisfied` because Phase 02 already has valid evidence.
- Phase 09-11 requirements remain `Pending` after Phase 08.

---

## Recommended Execution Interpretation

### Wave 1 — documentation backfill in parallel
- `08-01`: Phase 01, 03, 07 evidence repair
- `08-02`: Phase 04, 05, 06 evidence repair

These are parallel-safe because they touch different phase directories.

### Wave 2 — bookkeeping reconciliation
- `08-03`: `REQUIREMENTS.md` status sync + milestone audit refresh

This must run after both Wave 1 plans, because it depends on the newly created verification reports and repaired summary frontmatter.

---

## Sources

### Primary (HIGH confidence)
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`
- `.planning/phases/08-verification-traceability-backfill/08-01-PLAN.md`
- `.planning/phases/08-verification-traceability-backfill/08-02-PLAN.md`
- `.planning/phases/08-verification-traceability-backfill/08-03-PLAN.md`
- `.github/get-shit-done/templates/summary.md`
- `.github/get-shit-done/templates/verification-report.md`
- `.github/get-shit-done/workflows/audit-milestone.md`
- `.github/get-shit-done/workflows/execute-plan.md`
- `.github/get-shit-done/bin/lib/commands.cjs` (`summary-extract` behavior)
- `.planning/phases/01-schema-baseline-replayability/01-VERIFICATION.md`
- `.planning/phases/02-events-workflows-parity-foundations/02-VERIFICATION.md`
- `.planning/phases/02-events-workflows-parity-foundations/02-01-SUMMARY.md`

## Metadata

**Confidence breakdown:**
- Phase scope and requirement ownership: HIGH
- Summary frontmatter contract: HIGH
- Audit 3-source satisfaction rule: HIGH
- Recommended verification report style: HIGH
- Need for new external libraries: HIGH confidence that none are required

**Research date:** 2026-03-10
**Validity:** Valid until GSD summary/verification templates or milestone audit rules materially change
