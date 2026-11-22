# Integration adapters (Phase 8.2)

SANKALP can hand complaints to existing grievance systems, and accept their status updates, through adapters in `server/integrations/index.ts`. **None is connected.** Each adapter is an interface plus a field mapping, with a dry-run "outbox" driver that writes payloads to `DATA_DIR/integrations-outbox.jsonl` so the mapping can be checked with the portal owner.

## Before any live connection
1. The portal owner's API specification and a test endpoint.
2. A data-sharing agreement: purpose, retention, deletion, breach notification (DPDP Act 2023).
3. **Citizen consent** to share contact details. Without it the adapters send no name or phone (`includeContact: false`).
4. The portal's host added to `EGRESS_ALLOWLIST`, with every call through `safeFetch`.
5. A security review of the inbound status webhook (signed, per tenant).

## Rule that never changes
A status from another system can mark a SANKALP case "acknowledged" or "in progress", or record that the portal says "action taken". **It can never close a SANKALP case.** Closing still needs proof plus the citizen's confirmation (rule 4). A portal's "force closed" is logged, and the case stays open.

## CPGRAMS mapping (`cpgrams`)
| CPGRAMS field | From SANKALP |
|---|---|
| registrationSource | `"SANKALP"` |
| externalReference | ticket id (`UK-…`) |
| ministryOrState | tenant `stateLabel` |
| organisation | department name (category → department routing) |
| category | complaint category |
| grievanceText | description |
| district / dateOfReceipt | district / submittedAt |
| complainantName / complainantMobile | **only with citizen consent** |

| CPGRAMS status | SANKALP event |
|---|---|
| RECEIVED | acknowledged |
| UNDER_PROCESS | in_progress |
| DISPOSED | action_taken (the citizen is still asked to confirm) |
| REJECTED | rejected_by_portal (logged; the SANKALP case continues) |

## State CM Helpline mapping (`cm-helpline`, e.g. Uttarakhand 1905)
| Helpline field | From SANKALP |
|---|---|
| sourceTicket | ticket id |
| departmentCode | department id, upper case |
| subject | "category — ward, district" |
| details / priority / status | description / P1–P4 / legacy status |
| gps | complaint location, omitted when it is only the district centre |
| callerName / callerMobile | **only with citizen consent** |

| Helpline level | SANKALP event |
|---|---|
| L1 | acknowledged |
| L2, L3 | in_progress |
| CLOSED, FORCE_CLOSED | action_taken (force-closed is flagged; the case stays open until the citizen confirms) |

## Dry run
```ts
import { exportToOutbox } from "./server/integrations";
exportToOutbox("cpgrams", storage.getComplaints().slice(0, 10)); // writes DATA_DIR/integrations-outbox.jsonl
```

## Embeddable widgets (Phase 8.3)
| Widget | Embed |
|---|---|
| Ward score (Real Resolution Rate with CI) | `<iframe src="https://<host>/widget/ward-score?ward=<ward name>&lang=hi" width="340" height="150" title="Ward score"></iframe>` |
| Report an issue | `<iframe src="https://<host>/widget/report?lang=en" width="340" height="90" title="Report an issue"></iframe>` |

Widgets carry no personal data, may be framed by any site (`frame-ancestors *` only on `/widget/*`), and are cached for 5 minutes.
