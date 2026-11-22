import { pgTable, text, jsonb, timestamp, doublePrecision, integer, primaryKey, index, uniqueIndex, bigserial } from "drizzle-orm/pg-core";

/**
 * PostgreSQL schema (P1.1). Every row carries tenant_id (P1.3). Hot query columns are real, indexed columns;
 * the complete record is kept in `data` (jsonb) so the application model can evolve without a migration per field.
 * The SQL in server/db/migrations/0000_init.sql is the applied form of this schema (kept in sync by tests/db.test.ts).
 */
const common = {
  tenantId: text("tenant_id").notNull(),
  id: text("id").notNull(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  config: jsonb("config").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable("roles", { id: text("id").primaryKey(), description: text("description").notNull() });

export const departments = pgTable("departments", { ...common }, t => [primaryKey({ columns: [t.tenantId, t.id] })]);
export const categories = pgTable("categories", { ...common, departmentId: text("department_id").notNull() }, t => [primaryKey({ columns: [t.tenantId, t.id] })]);
export const policeStations = pgTable("police_stations", { ...common, district: text("district"), lat: doublePrecision("lat"), lng: doublePrecision("lng") },
  t => [primaryKey({ columns: [t.tenantId, t.id] }), index("police_stations_geo").on(t.tenantId, t.lat, t.lng)]);

export const users = pgTable("users", { ...common, phone: text("phone").notNull(), role: text("role").notNull(), district: text("district") },
  t => [primaryKey({ columns: [t.tenantId, t.id] }), uniqueIndex("users_tenant_phone").on(t.tenantId, t.phone), index("users_role").on(t.tenantId, t.role)]);

export const complaints = pgTable("complaints", {
  ...common,
  status: text("status").notNull(), // lifecycle state (M7)
  district: text("district"), category: text("category"), departmentId: text("department_id"), priority: text("priority"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lat: doublePrecision("lat"), lng: doublePrecision("lng"), userId: text("user_id"),
}, t => [
  primaryKey({ columns: [t.tenantId, t.id] }),
  index("complaints_tenant_status").on(t.tenantId, t.status),
  index("complaints_tenant_created").on(t.tenantId, t.createdAt),
  index("complaints_dept_status").on(t.departmentId, t.status),
  index("complaints_geo").on(t.tenantId, t.lat, t.lng),
]);

export const complaintEvents = pgTable("complaint_events", { ...common, complaintId: text("complaint_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull() },
  t => [primaryKey({ columns: [t.tenantId, t.id] }), index("complaint_events_complaint").on(t.tenantId, t.complaintId)]);

export const media = pgTable("media", { ...common, ownerId: text("owner_id"), kind: text("kind"), visibility: text("visibility") },
  t => [primaryKey({ columns: [t.tenantId, t.id] })]);

/** Phase 3 verification artefacts (proof checks + decisions). */
export const proofs = pgTable("proofs", { ...common, complaintId: text("complaint_id").notNull() }, t => [primaryKey({ columns: [t.tenantId, t.id] })]);
export const verifications = pgTable("verifications", { ...common, complaintId: text("complaint_id").notNull(), decision: text("decision") },
  t => [primaryKey({ columns: [t.tenantId, t.id] })]);

export const sosEvents = pgTable("sos_events", {
  ...common, status: text("status").notNull(), district: text("district"), category: text("category"), userId: text("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(), lat: doublePrecision("lat"), lng: doublePrecision("lng"),
}, t => [primaryKey({ columns: [t.tenantId, t.id] }), index("sos_tenant_status").on(t.tenantId, t.status), index("sos_tenant_created").on(t.tenantId, t.createdAt), index("sos_geo").on(t.tenantId, t.lat, t.lng)]);

/** Phase 6 trusted contacts. */
export const sosContacts = pgTable("sos_contacts", { ...common, userId: text("user_id").notNull() }, t => [primaryKey({ columns: [t.tenantId, t.id] })]);

export const workers = pgTable("workers", { ...common, district: text("district"), status: text("status") }, t => [primaryKey({ columns: [t.tenantId, t.id] })]);
export const workerLocations = pgTable("worker_locations", {
  seq: bigserial("seq", { mode: "number" }).primaryKey(), tenantId: text("tenant_id").notNull(), workerId: text("worker_id").notNull(),
  lat: doublePrecision("lat").notNull(), lng: doublePrecision("lng").notNull(), at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("worker_locations_worker").on(t.tenantId, t.workerId, t.at)]);

export const announcements = pgTable("announcements", { ...common, district: text("district"), createdAt: timestamp("created_at", { withTimezone: true }) },
  t => [primaryKey({ columns: [t.tenantId, t.id] }), index("announcements_tenant_created").on(t.tenantId, t.createdAt)]);
export const rtiRequests = pgTable("rti_requests", { ...common, status: text("status"), district: text("district") },
  t => [primaryKey({ columns: [t.tenantId, t.id] }), index("rti_tenant_status").on(t.tenantId, t.status)]);
export const consents = pgTable("consents", { ...common, userId: text("user_id").notNull(), version: text("version").notNull() },
  t => [primaryKey({ columns: [t.tenantId, t.id] }), index("consents_user").on(t.tenantId, t.userId)]);
export const auditLog = pgTable("audit_log", { ...common, seq: integer("seq").notNull(), hash: text("hash"), prevHash: text("prev_hash") },
  t => [primaryKey({ columns: [t.tenantId, t.id] }), index("audit_tenant_seq").on(t.tenantId, t.seq)]);
export const reviewTasks = pgTable("review_tasks", { ...common, status: text("status") }, t => [primaryKey({ columns: [t.tenantId, t.id] })]);
export const sessions = pgTable("sessions", { ...common, userId: text("user_id").notNull() }, t => [primaryKey({ columns: [t.tenantId, t.id] })]);

/** Smaller collections (polls, petitions, events, chat, incidents, credentials, push tokens, …) share one table. */
export const records = pgTable("records", { ...common, collection: text("collection").notNull() },
  t => [primaryKey({ columns: [t.tenantId, t.collection, t.id] })]);

