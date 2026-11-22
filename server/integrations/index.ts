import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "../config";
import { tenant } from "../tenancy";
import { DEPARTMENTS, getDeptIdForCategory } from "../data/reference";
import { legacyStatus } from "../domain/complaintState";
import type { Complaint } from "../types";

/**
 * P8.2 integration adapters for CM helplines and grievance portals (CPGRAMS, state CM Helpline). **Interface and
 * mappings only** — nothing is sent anywhere. A live connection needs the portal owner's API spec, a data-sharing
 * agreement and the citizen's explicit consent for contact details (docs/INTEGRATIONS.md).
 *  - toExternal(): our complaint → the external payload (contact details only when `includeContact` is true)
 *  - fromExternalStatus(): their status code → our state machine event (never closes a case by itself — rule 4)
 * Driver "outbox" (default) appends payloads to DATA_DIR/integrations-outbox.jsonl for dry runs.
 */
export interface ExternalPayload { [k: string]: unknown }
export type InboundEvent = { kind: "acknowledged" | "in_progress" | "action_taken" | "rejected_by_portal" | "unknown"; note?: string };

export interface GrievanceAdapter {
  id: string;
  name: string;
  toExternal(c: Complaint, opts: { includeContact: boolean }): ExternalPayload;
  fromExternalStatus(code: string): InboundEvent;
}

const categoryText = (c: Complaint) => c.category.replace(/_/g, " ");

export const cpgrams: GrievanceAdapter = {
  id: "cpgrams",
  name: "CPGRAMS (Centralised Public Grievance Redress and Monitoring System)",
  toExternal(c, { includeContact }) {
    return {
      registrationSource: "SANKALP",
      externalReference: c.ticketId,
      ministryOrState: tenant().stateLabel,
      organisation: DEPARTMENTS[getDeptIdForCategory(c.category)]?.name ?? "State Government",
      category: categoryText(c),
      grievanceText: c.description,
      district: c.district,
      dateOfReceipt: c.submittedAt,
      ...(includeContact ? { complainantName: c.submittedBy, complainantMobile: c.submittedByPhone } : {}),
    };
  },
  fromExternalStatus(code) {
    const m: Record<string, InboundEvent["kind"]> = { RECEIVED: "acknowledged", UNDER_PROCESS: "in_progress", DISPOSED: "action_taken", REJECTED: "rejected_by_portal" };
    return { kind: m[code.toUpperCase()] ?? "unknown" };
  },
};

export const stateCmHelpline: GrievanceAdapter = {
  id: "cm-helpline",
  name: "State CM Helpline (e.g. Uttarakhand 1905)",
  toExternal(c, { includeContact }) {
    return {
      source: "SANKALP", sourceTicket: c.ticketId, departmentCode: getDeptIdForCategory(c.category).toUpperCase(),
      subject: `${categoryText(c)} — ${c.ward}, ${c.district}`, details: c.description, priority: c.priority,
      status: legacyStatus(c.state), gps: c.geoApproximate ? undefined : c.geo,
      ...(includeContact ? { callerName: c.submittedBy, callerMobile: c.submittedByPhone } : {}),
    };
  },
  fromExternalStatus(code) {
    const m: Record<string, InboundEvent["kind"]> = { L1: "acknowledged", L2: "in_progress", L3: "in_progress", CLOSED: "action_taken", FORCE_CLOSED: "action_taken" };
    return { kind: m[code.toUpperCase()] ?? "unknown", note: code.toUpperCase() === "FORCE_CLOSED" ? "Portal closed it without citizen confirmation — SANKALP keeps the case open" : undefined };
  },
};

export const ADAPTERS: Record<string, GrievanceAdapter> = { [cpgrams.id]: cpgrams, [stateCmHelpline.id]: stateCmHelpline };

/** Dry-run export (driver "outbox"). Returns the number of payloads written. */
export function exportToOutbox(adapterId: string, complaints: Complaint[], includeContact = false): number {
  const a = ADAPTERS[adapterId];
  if (!a) throw new Error(`Unknown adapter ${adapterId}`);
  if (process.env.INTEGRATION_DRIVER && process.env.INTEGRATION_DRIVER !== "outbox") throw new Error("Only the outbox driver exists until a live integration is approved");
  const file = path.join(path.resolve(config().DATA_DIR), "integrations-outbox.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = complaints.map(c => JSON.stringify({ adapter: a.id, at: new Date().toISOString(), payload: a.toExternal(c, { includeContact }) }));
  if (lines.length) fs.appendFileSync(file, lines.join("\n") + "\n", { mode: 0o600 });
  return lines.length;
}
