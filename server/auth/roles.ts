/**
 * Roles (P1.4). `admin` is the legacy name of `district_admin` and is accepted everywhere.
 *  citizen · worker (field staff) · officer (department officer, district-scoped) · dept_admin (department head)
 *  district_admin · police (police user account) · state_admin (state-wide read/act) · super_admin (system owner)
 */
export const ROLES = ["citizen", "worker", "officer", "dept_admin", "district_admin", "admin", "police", "state_admin", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

interface HasRole { role: string }

/** District admin or above — sees complaints/SOS of its scope and can act on them. */
export const isAdminUser = (u?: HasRole | null): boolean => !!u && (u.role === "admin" || u.role === "district_admin" || u.role === "state_admin" || u.role === "super_admin");
/** State-wide visibility (no district filter). */
export const isStateUser = (u?: HasRole | null): boolean => !!u && (u.role === "state_admin" || u.role === "super_admin");
/** District-scoped administrator. */
export const isDistrictAdmin = (u?: HasRole | null): boolean => !!u && (u.role === "admin" || u.role === "district_admin");
/** Department staff accounts (bound to a departmentId). */
export const isDeptUser = (u?: HasRole | null): boolean => !!u && (u.role === "officer" || u.role === "dept_admin");
export const isCitizenLike = (u?: HasRole | null): boolean => !!u && (u.role === "citizen" || u.role === "worker");
