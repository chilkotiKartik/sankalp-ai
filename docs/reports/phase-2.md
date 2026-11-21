# Phase 2 report — Sovereign AI layer

**Status:** complete. The gate is green after the independent review and its fixes. **Date:** 2026-11-21

## Delivered
| Task | What |
|---|---|
| P2.1 | `server/ai/gateway.ts` is the only module that calls a model. 8 s timeout, one retry after a backoff (never after a timeout), an overall per-call deadline, per-provider circuit breaker with a single half-open probe, and metrics (`GET /api/admin/ai/metrics`, state staff) |
| P2.2 | Text: Sarvam (India) or a self-hosted OpenAI-compatible endpoint, otherwise the rules engine. Vision: self-hosted only, otherwise manual review. Speech: Sarvam |
| P2.3 | `server/ai/pii.ts` masks phones and 12-digit IDs in any grouping (including Devanagari digits), e-mails, house/flat numbers (English and Hindi) and PIN codes. A last guard refuses to send anything that still looks like PII |
| P2.4 | Versioned prompts with zod output schemas (`server/ai/prompts`). Citizen text is fenced as data |
| P2.5 | `npm run eval`: a dev set (307, five languages) and a **held-out** set (36) never used for tuning. Runs in CI and fails on a >2-point drop, a mixed-method run, or a missing baseline |
| P2.6 | Every complaint stores an `aiDecisions` record (method, provider, model, prompt version, masked-input hash, confidence, reason). The department portal shows why a complaint was routed |
| P2.7 | All model traffic goes through `safeFetch`. A self-hosted host must be explicitly allow-listed |

## Accuracy (rules engine, no model configured)
| Set | n | Accuracy |
|---|---|---|
| dev (rules tuned on it) | 307 | 78.2% (en 66 · hi 84 · hinglish 75 · garhwali 100 · kumaoni 93) |
| held-out | 36 | 77.8% (en 79 · hi 86 · hinglish 63) |

The Garhwali/Kumaoni dev scores are inflated, because the rules contain phrases taken from those rows. A held-out dialect set needs native speakers, and I did not invent one.

## Independent review — findings and fixes
| # | Sev | Finding | Fix |
|---|---|---|---|
| 1 | High | Address masking swallowed civic words ("door to door garbage", "flat tyre") | Keyword must be followed by a number. Hindi rule no longer fires inside words |
| 2 | High | Phone/ID formats with dashes, dots, brackets and spaces were not masked; the guard was never called | Digit runs normalised and classified. Hindi variants added. `looksLikePII` blocks the call |
| 3 | Med | A hanging provider blocked complaint creation for 16 s | No retry on timeout. Classification has a 4 s deadline |
| 4 | Med | Failed calls missing from latency metrics | Failures are timed |
| 5 | Med | Photos got no review task when a vision model was configured | Every photo gets a review task |
| 6 | Med | The citizen's first name went into the chat system prompt | Removed |
| 7 | Med | Eval could pass on a mixed or unbaselined run; tuned on its own test set | Per-row method check, missing baseline fails, held-out set added |
| 8 | Low | Model `reason` passed to officers unfiltered; prompt injection | Delimited prompt, masked `AI suggestion:` reason, a low-confidence model answer loses to a definite rules match |
| 9 | Low | "Real photo" accepted at any confidence | Below 80% → manual review |
| 10 | Low | `analyze-image` forwarded arbitrary model keys | Strict zod schema |
| 11 | Low | Thundering half-open, immediate 429 retry, `$&` in prompt vars | Single probe, 1 s backoff on 429, literal substitution |

Tests: `tests/ai.test.ts` has 43 cases (masking, over-masking, retry/breaker/deadline, half-open, schema rejection, injection fencing, rules preference).

## Not done / limits
- The summarize, reply-citizen and officer-brief prompts are defined but not wired yet. They are used by the Phase 4 agents.
- Chat and RTI drafting use free-form prompts with no decision record. They are assistive text, not decisions.
