import type { Role } from "./roles";

/**
 * RBAC permission map (P1.4). Every route's `permission` must appear here; tests/platform.test.ts fails otherwise.
 * Principals:
 *   user roles (see roles.ts) · "dept_token" (any department portal session) · "dept_token:<id>" (a specific department)
 *   "public" (no authentication required — the route must return no personal data)
 */
export type Principal = Role | "dept_token" | `dept_token:${string}` | "public";

const CITIZENS: Principal[] = ["citizen", "worker"];
const ADMINS: Principal[] = ["admin", "district_admin", "state_admin", "super_admin"];
const DEPT_USERS: Principal[] = ["officer", "dept_admin"];
const POLICE: Principal[] = ["police", "dept_token:police", "dept_token:usdma", ...ADMINS];
const USERS: Principal[] = [...CITIZENS, ...DEPT_USERS, "police", ...ADMINS];
const DEPT: Principal[] = ["dept_token", ...DEPT_USERS];
const STATE: Principal[] = ["state_admin", "super_admin"];
const SUPER: Principal[] = ["super_admin"];
const PUBLIC: Principal[] = ["public"];

export const PERMISSIONS: Record<string, Principal[]> = {
  // auth
  "auth.register": PUBLIC, "auth.login": PUBLIC, "auth.otp_request": PUBLIC, "auth.otp_verify": PUBLIC, "auth.refresh": PUBLIC,
  "auth.me": USERS, "auth.logout": USERS, "dept.login": PUBLIC, "worker.pin_login": PUBLIC, "worker.submit_proof": PUBLIC,
  "dept.rotate_code": SUPER, "users.create_staff": SUPER,
  // public / reference
  "public.health": PUBLIC, "public.config": PUBLIC, "public.dashboard": PUBLIC, "public.reference": PUBLIC,
  "reference.read": USERS, "wards.read": USERS, "risk.read": USERS, "leaderboard.read": USERS, "insights.read": USERS,
  "budget.read": USERS, "departments.summary": USERS,
  // complaints
  "complaints.list": USERS, "complaints.read": USERS, "complaints.create": USERS, "complaints.upvote": USERS,
  "complaints.citizen_confirm": USERS, "complaints.citizen_reject": USERS, "complaints.citizen_cancel": USERS,
  "complaints.chat_read": USERS, "complaints.chat_write": USERS, "complaints.audit_read": USERS,
  "complaints.events": [...USERS, ...DEPT],
  "complaints.admin_list": ADMINS, "complaints.review": ADMINS,
  "complaints.officer_update": [...ADMINS, ...DEPT], "complaints.assign_worker": DEPT,
  // SOS (rule 9: every signed-in person can raise SOS)
  "sos.create": USERS, "sos.create_women_safety": USERS, "sos.create_forest_fire": USERS, "sos.update_location": USERS,
  "sos.attach_audio": USERS, "sos.list": [...USERS, "dept_token"],
  "sos.resolve": [...ADMINS, ...POLICE, ...DEPT], "sos.legal_hold": [...STATE, "police", "dept_token:police"], "sos.read_evidence": [...ADMINS, ...POLICE, ...DEPT],
  // media
  "media.upload_image": [...USERS], "media.signed_read": PUBLIC, "media.upload_audio": USERS, "media.read_evidence": [...USERS, ...POLICE, "dept_token"],
  // CPR / police command
  "cpr.command_read": POLICE, "cpr.command_stream": POLICE, "cpr.incident_create": POLICE, "cpr.incident_update": POLICE,
  "cpr.patrol_location": POLICE, "cpr.patrols_read": [...USERS, ...POLICE], "cpr.citizen_request": USERS,
  "cpr.night_safety_read": [...USERS, ...POLICE], "cpr.night_safety_report": USERS,
  // departments
  "dept.complaints_read": DEPT, "dept.stats_read": DEPT, "dept.workers_read": DEPT, "dept.announcements_read": DEPT,
  "dept.announcements_write": ["dept_token", "dept_admin"], "dept.stream": DEPT, "dept.review_queue": DEPT,
  // admin / governance
  "admin.stats": ADMINS, "admin.state_overview": STATE, "admin.assign_task": STATE, "broadcast.emergency": ADMINS,
  "announcements.read": USERS, "announcements.write": ADMINS, "audit.read": ADMINS, "audit.verify": STATE,
  // community / RTI
  "community.read": USERS, "community.vote": USERS, "community.sign": USERS, "community.rsvp": USERS,
  "community.petition_create": USERS, "community.poll_create": ADMINS, "community.event_create": ADMINS,
  "rti.read": USERS, "rti.file": USERS, "rti.respond": ADMINS,
  // workers
  "workers.list": USERS, "workers.report_location": ["worker"], "workers.stream": ADMINS,
  // AI
  "ai.chat": USERS, "ai.vision": USERS, "ai.rti_draft": USERS,
  // misc
  "push.register": USERS, "bills.read": USERS, "bills.pay": USERS,
  // DPDP (P1.9)
  "privacy.consent": USERS, "privacy.export": USERS, "privacy.erasure_request": USERS, "privacy.erasure_review": STATE,
};

/** True if any of the actor's principals is allowed. Unknown permissions are denied (fail closed). */
export function permits(permission: string, principals: Principal[]): boolean {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  if (allowed.includes("public")) return true;
  return principals.some(p => allowed.includes(p));
}
