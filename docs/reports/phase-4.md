# Phase 4 report — Agentic workflows (humans in the loop)

**Status:** complete. The gate is green after the independent review and its fixes. **Date:** 2026-11-21

## Delivered (server/agents/)
| Task | Agent | What a human still does |
|---|---|---|
| P4.1 | **Duplicates**: same category, ≤ 100 m, ≤ 7 days, close (≤ 30 m) or text-similar (Jaccard ≥ 0.3). Links a new complaint to an open parent that has no proof yet. Shows "N citizens affected" (distinct people), and priority rises at 3 and 10 people. Parent proof is propagated to the children | Unmerge (staff). Every child's own citizen confirms their fix |
| P4.2 | **SLA ladder**: 75% → officer, 100% → department head, 150% → district admin. Each level is audited and notified once (crossed levels included). Paused while awaiting the citizen; resets on reopen | Snooze with a reason. Department head or admin; only an admin once the case reaches level 2; 168 h total cap |
| P4.3 | **Workload balancer**: ranks workers by load, distance and skill, with reasons | Officer assigns |
| P4.4 | **Weekly district briefing**: every figure names its source query, plus top categories, Real Resolution Rate and trend rows. JSON or PDF (dependency-free writer) | Reads and acts |
| P4.5 | **Seasonal trends**: 3-week window around the same week in each covered earlier year. `insufficient_data` unless ≥ 2 years and n ≥ 10. "Rising" only above the 95% Poisson bound | Interprets |
| P4.6 | **Hard limit**: a static test fails the build if any agent module calls close, reject, cancel, review, proof or assign, writes `.state`, or deletes records | — |

## Independent review — findings and fixes (`tests/agents.test.ts`, 12 tests)
| # | Sev | Finding | Fix |
|---|---|---|---|
| 1 | High | A child linked to a parent already past proof was stranded: no proof, no SLA, not counted | Merge only into NEW/ASSIGNED/IN_PROGRESS parents. A child counts as "covered" only while both are before proof |
| 2 | Med | One account could inflate "affected" and priority | Counts distinct people (including the parent's owner) |
| 3 | Med | Escalation skipped levels after a snooze; officers could snooze themselves forever | Every crossed level audited. Snooze limited to department head/admin, admin-only at level ≥ 2, 168 h total |
| 4 | Med | Snooze reason (could contain a phone number) visible to citizens | Masked with `maskPII`. SLA and merge internals stripped from citizen responses |
| 5 | Med | Trends at New Year counted the current week as last year's baseline | Date-aligned windows (52 weeks back), observed window excluded, empty covered years count as 0 |
| 6 | Low | Proof propagated to rejected or escalated children, and after a flagged parent proof | Only to children before proof, never after NEEDS_REVIEW. Actor kind preserved |
| — | Note | Briefing listed free-text locations | Ward and category only |

The review confirmed: no agent path closes, rejects, cancels or deletes; no merge chains or cross-district merges; the PDF writer escapes correctly with byte-exact xref offsets.

## Limits
- PDFs use standard fonts, so Devanagari and symbols such as "≥" print as "?" (D-040). The JSON version is exact.
- Department tokens are state-wide by design (D-023), so a department can unmerge or snooze its category in any district. District-scoped officer accounts exist for finer control.
