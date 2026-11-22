# Phase 8 report — Transparency and integrations

**Status:** complete. The gate is green after the independent review and its fixes. **Date:** 2026-11-22

## Delivered
| Task | What |
|---|---|
| P8.1 | `/web/transparency`: no login, no JS, axe clean. Per department: official rate vs **Real Resolution Rate** vs SLA compliance, with 95% Wilson intervals; ward table. Open data `/api/open-data/complaints.{csv,json}`: monthly aggregates, data dictionary, GODL-India |
| P8.2 | CPGRAMS and state CM Helpline adapters (`server/integrations`): mappings and a dry-run outbox, no live calls. Contact details only with consent; a portal status never closes a case. `docs/INTEGRATIONS.md` |
| P8.3 | Widgets `/widget/ward-score` and `/widget/report` (en/hi). Only these pages allow framing |
| P8.4 | README security section, `docs/ARCHITECTURE.md` (diagram, flows, code map), DATA_RESIDENCY, SECURITY, OPERATIONS §8–12, CHANGELOG |

## Independent review — findings and fixes (`server/transparency/disclosure.ts`)
| # | Sev | Finding | Fix |
|---|---|---|---|
| 1 | High | Exact department totals undid suppressed cells by subtraction (reproduced) | Public totals rounded to multiples of 5; scorecard uses the same 365-day window |
| 2 | High | Rates exposed small numerators (p × n) (reproduced) | A rate is published only when numerator, denominator and complement are all 0 or ≥ 5 |
| 3 | High | The older `/api/public/resolution-rate` returned every raw count (reproduced) | Public variant with the same rules; staff screens keep exact figures |
| 4 | High | Citizen free-text ward reached open data (name, phone, CSV formula) (reproduced) | Only reference-list wards are published (else "Other"); CSV formulas neutralised |
| 5 | Med | Adapters sent unmasked descriptions and exact GPS without consent (reproduced) | Masked text and no GPS unless contact sharing is consented |
| 6 | Med | Open data in demo mode had no demo marker | `demo` flag in JSON, `-DEMO` file name, `dataStatus` column in CSV |
| 7 | Low | Complements (filed − verified) not suppressed | Complementary suppression of 1–4 differences |

## Limits
- Disclosure control is rule-based: primary + complementary suppression and rounding. A formal statistical disclosure audit (e.g. with τ-Argus) is recommended before publishing at national scale.
- The adapters are dry-run only; live use needs each portal owner's API and a data-sharing agreement.
