import type { Complaint, SOSAlert, AppUser, Worker, PatrolVan, SafetyIncident } from "../storage";

/**
 * Response shaping (audit C6/H12). Raw storage objects are never returned directly.
 *  - Staff see operational detail (still never secrets such as worker PINs, which are not stored).
 *  - Citizens see their own complaint in full and other citizens' complaints without PII.
 */
export type PublicUser = Pick<AppUser, "id" | "name" | "phone" | "role" | "district" | "points" | "badges" | "level">;

export function toPublicUser(u: AppUser): PublicUser {
  return { id: u.id, name: u.name, phone: u.phone, role: u.role, district: u.district, points: u.points, badges: u.badges, level: u.level };
}

export function toStaffComplaint(c: Complaint): Complaint {
  return { ...c, upvotedBy: [] };
}

export function toCitizenComplaint(c: Complaint, viewer: AppUser): Partial<Complaint> & { isMine: boolean; hasUpvoted: boolean } {
  const mine = c.userId === viewer.id;
  const base = {
    ...c,
    isMine: mine,
    hasUpvoted: c.upvotedBy.includes(viewer.id),
    upvotedBy: c.upvotedBy.includes(viewer.id) ? [viewer.id] : [],
    rejectedBy: undefined,
    assignedWorkerPhone: undefined,
    adminNote: mine ? c.adminNote : undefined,
  };
  if (mine) return base;
  return { ...base, userId: undefined, submittedBy: "Citizen", submittedByPhone: undefined, feedback: undefined, proofNote: undefined };
}

export function complaintFor(viewer: AppUser | undefined, c: Complaint, staff: boolean) {
  if (staff || !viewer) return toStaffComplaint(c);
  return toCitizenComplaint(c, viewer);
}

/** Citizens only ever see their own SOS alerts. */
export function toOwnerSos(a: SOSAlert): SOSAlert {
  return { ...a };
}

export function toPublicWorker(w: Worker): Omit<Worker, "phone"> & { phone?: string } {
  return { ...w, phone: undefined };
}

export function toPublicVan(v: PatrolVan) {
  return { ...v, officerPhone: undefined };
}

export function toCprIncident(i: SafetyIncident) {
  return { ...i };
}
