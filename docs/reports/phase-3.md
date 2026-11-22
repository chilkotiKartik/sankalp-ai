# Phase 3 report — Proof-of-Fix 2.0

**Status:** complete. The gate is green after the independent review and its fixes. **Date:** 2026-11-21

## Delivered (server/verification/)
| Task | What | Signal when not measurable |
|---|---|---|
| P3.1 geo | EXIF GPS of the original photo and device GPS sent with the proof, compared with the complaint location (tenant `proofRadiusM`, 50 m). Flags: far from site, GPS sources disagree, photo older than the complaint. Proof in the app is camera-only | unknown (no GPS, or the complaint was filed without GPS) |
| P3.2 reuse | 64-bit DCT pHash of every upload, computed in a worker thread. Hamming ≤ 8 against all of the state's photos → flag (`proof_is_before_photo` / `reused_photo`) | unknown (too small, flat, WebP, > 16 MP) |
| P3.3 scene | Background (periphery) hash of before vs after (D-037: weak signal; ORB/embeddings need a self-hosted model) | unknown |
| P3.4 change | Category question to a **self-hosted** vision model only | unknown |
| P3.5 citizen | In-app; SMS reminder (2 h) + inbound reply webhook; IVR voice callback (24 h) with Sarvam TTS and a signed, round-bound token | pending |
| P3.6 neighbours | Up to 3 opted-in users who filed nearby. Their identities are never exposed | unknown |
| P3.7 engine | Weighted score over **known** signals (weights in tenant config), plus coverage. Flags → human review. Only the citizen's "no" rejects. A reviewer cannot close without the citizen (D-036). Department portal has a Proof Review page | — |
| P3.8 RRR | `GET /api/public/resolution-rate`: citizen-verified ÷ marked resolved, with 95% Wilson CI and n, beside the official rate (D-038) | — |

## Independent review — findings and fixes (`tests/verification.test.ts`)
| # | Sev | Finding | Fix |
|---|---|---|---|
| 1 | High | A citizen "yes" during the asynchronous checks closed the case before the flags arrived (reproduced) | `verificationPending`: the answer is recorded and `applyVerification` decides (close if clean, review if flagged). Checks interrupted by a crash fail closed to review after 15 min |
| 2 | High | Synchronous double decode on upload: a 0.5 MB PNG bomb used 3.6 GB and blocked the server for 6 s (reproduced) | Header dimension check (> 16 MP skipped), a single decode in a worker thread with a 20 s limit and a memory cap. Uploads no longer wait |
| 3 | Med | The district-centre fallback location caused false "far from site" flags and fake neighbours | `geoApproximate` → geo unknown; no neighbour invites or duplicate matching |
| 4 | Med | IVR token could be replayed and reused across proof rounds | Token bound to `proofSubmittedAt`, one answer per round, rate-limited |
| 5 | Low–Med | A department could clear fraud flags on its own proof | Reused-photo/location flags need a district or state reviewer; the portal shows a lock |
| 6 | Low | Inbound SMS matched only the first user with that phone; one secret for all tenants | Match every user with that phone, per-tenant secret `INBOUND_SMS_SECRET_<TENANT>`, rate limit |
| 7 | Low | Console voice log held the full phone number and the token | Masked number, no token |

The review confirmed there is no path to CLOSED without proof plus the owner's "yes", and that verification errors fail closed.

## Limits (honest)
- The same-scene check is heuristic. Without a self-hosted vision model there is no change check, so coverage is typically 60–85%.
- No telephony or SMS provider is hard-coded. Production needs a DLT-registered SMS gateway and an Indian IVR provider, with their hosts allow-listed.
