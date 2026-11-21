import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { config } from "../config";
import { storeFor, allStores, getDeptIdForCategory, type AppStorage } from "../storage";
import { tenantIds, tenant, runInTenant } from "../tenancy";
import { ROLES } from "../auth/roles";
import { logger } from "../lib/logger";
import { unref } from "../lib/errors";

/**
 * PostgreSQL driver (P1.2). STORAGE_DRIVER=postgres + DATABASE_URL.
 *  - DATABASE_URL=postgres://…  → node-postgres Pool (e.g. a Render Postgres add-on)
 *  - DATABASE_URL=pglite:<dir>   → embedded PGlite on disk (no server, no Docker) — also used by tests (pglite:memory)
 * Each tenant's working set lives in memory (same as the snapshot driver) and is made durable by write-behind:
 * changed rows are upserted, removed rows deleted, in one transaction, ~300 ms after a change.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction(fn: (tx: Db) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

export async function openDb(url: string): Promise<Db> {
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const target = url.slice("pglite:".length);
    const pg = target === "memory" ? new PGlite() : new PGlite(path.resolve(target));
    const wrap = (q: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Db => ({
      query: async <T,>(s: string, p?: unknown[]) => (await q.query(s, p)).rows as T[],
      transaction: async (fn) => { await pg.transaction(async (tx) => fn(wrap(tx as never))); },
      close: async () => { await pg.close(); },
    });
    return wrap(pg);
  }
  const { Pool } = await import("pg");
  // TLS certificates are verified by default (review P1-M6). DATABASE_SSL=insecure only for a provider with a private CA you cannot install.
  const wantsTls = /sslmode=(require|verify)|render\.com/.test(url) || process.env.DATABASE_SSL === "require";
  const ssl = process.env.DATABASE_SSL === "off" ? undefined : process.env.DATABASE_SSL === "insecure" ? { rejectUnauthorized: false } : wantsTls ? { rejectUnauthorized: true } : undefined;
  const pool = new Pool({ connectionString: url, max: 5, ssl });
  const asDb = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Db => ({
    query: async <T,>(s: string, p?: unknown[]) => (await c.query(s, p)).rows as T[],
    transaction: async (fn) => {
      const client = await pool.connect();
      try { await client.query("BEGIN"); await fn(asDb(client)); await client.query("COMMIT"); }
      catch (e) { await client.query("ROLLBACK"); throw e; }
      finally { client.release(); }
    },
    close: async () => { await pool.end(); },
  });
  return asDb(pool);
}

// ── migrations ────────────────────────────────────────────────────────────────
export async function migrate(db: Db, dir = path.resolve(process.cwd(), "server", "db", "migrations")): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ version: string }>("SELECT version FROM schema_migrations")).map(r => r.version));
  const applied: string[] = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    const statements = fs.readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
    await db.transaction(async tx => {
      for (const st of statements) await tx.query(st);
      await tx.query("INSERT INTO schema_migrations (version) VALUES ($1)", [f]);
    });
    applied.push(f);
  }
  return applied;
}

// ── collection ↔ table mapping ────────────────────────────────────────────────
type Row = Record<string, unknown>;
interface Mapping {
  coll: string;
  table: string;
  key: (r: Row) => string;
  cols?: (r: Row) => Record<string, unknown>;
  sort?: (a: Row, b: Row) => number;
}
const ts = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? new Date(v).toISOString() : new Date().toISOString());
const desc = (f: string) => (a: Row, b: Row) => String(b[f] ?? "").localeCompare(String(a[f] ?? ""));
const asc = (f: string) => (a: Row, b: Row) => String(a[f] ?? "").localeCompare(String(b[f] ?? ""));
const byId = (r: Row) => String(r.id);
const geoOf = (r: Row, f = "geo") => (r[f] as { lat?: number; lng?: number } | undefined) ?? {};

export const MAPPINGS: Mapping[] = [
  { coll: "users", table: "users", key: byId, cols: r => ({ phone: r.phone, role: r.role, district: r.district }) },
  { coll: "complaints", table: "complaints", key: byId, sort: desc("submittedAt"),
    cols: r => ({ status: r.state, district: r.district, category: r.category, department_id: getDeptIdForCategory(String(r.category)), priority: r.priority,
      created_at: ts(r.submittedAt), lat: geoOf(r).lat ?? null, lng: geoOf(r).lng ?? null, user_id: r.userId ?? null }) },
  { coll: "complaintEvents", table: "complaint_events", key: byId, sort: asc("at"), cols: r => ({ complaint_id: r.complaintId, created_at: ts(r.at) }) },
  { coll: "media", table: "media", key: byId, cols: r => ({ owner_id: r.ownerId, kind: r.kind, visibility: r.visibility }) },
  { coll: "sosAlerts", table: "sos_events", key: byId, sort: desc("triggeredAt"),
    cols: r => ({ status: r.status, district: r.district, category: r.category, user_id: r.userId ?? null, created_at: ts(r.triggeredAt), lat: geoOf(r).lat ?? null, lng: geoOf(r).lng ?? null }) },
  { coll: "workers", table: "workers", key: byId, cols: r => ({ district: r.district, status: r.status }) },
  { coll: "announcements", table: "announcements", key: byId, sort: desc("postedAt"), cols: r => ({ district: r.targetDistrict ?? null, created_at: ts(r.postedAt) }) },
  { coll: "rtis", table: "rti_requests", key: byId, sort: desc("filedAt"), cols: r => ({ status: r.status, district: r.district }) },
  { coll: "auditLogs", table: "audit_log", key: byId, sort: (a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0) || asc("timestamp")(a, b),
    cols: r => ({ seq: Number(r.seq ?? 0), hash: r.hash ?? null, prev_hash: r.prevHash ?? null }) },
  { coll: "reviewTasks", table: "review_tasks", key: byId, sort: asc("createdAt"), cols: r => ({ status: r.status }) },
  { coll: "sessions", table: "sessions", key: r => String(r.sid), cols: r => ({ user_id: r.userId }) },
  { coll: "consents", table: "consents", key: byId, sort: asc("at"), cols: r => ({ user_id: r.userId, version: r.version }) },
  { coll: "verifications", table: "verifications", key: byId, sort: asc("at"), cols: r => ({ complaint_id: r.complaintId, decision: r.decision ?? null }) },
  { coll: "sosContacts", table: "sos_contacts", key: byId, cols: r => ({ user_id: r.userId }) },
];
const RECORD_KEYS: Record<string, (r: Row) => string> = {
  tokens: r => String(r.tokenHash), refreshTokens: r => String(r.hash), otps: r => String(r.phone), workerPins: r => String(r.key),
  deptCredentials: r => String(r.departmentId), pushTokens: r => String(r.token),
};

const hashRow = (r: unknown) => createHash("sha1").update(JSON.stringify(r)).digest("hex");

export class PgPersistence {
  private saved = new Map<string, Map<string, Map<string, string>>>(); // tenant → collection → key → hash
  private revisions = new Map<string, number>();
  private flushing: Promise<void> | null = null;

  constructor(private db: Db) {}

  async syncReference() {
    for (const id of tenantIds()) {
      const t = tenant(id);
      await this.db.query(`INSERT INTO tenants (id, name, config, updated_at) VALUES ($1,$2,$3,now()) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, config=EXCLUDED.config, updated_at=now()`, [t.id, t.name, JSON.stringify(t)]);
      for (const [dId, d] of Object.entries(t.departments)) {
        await this.db.query(`INSERT INTO departments (tenant_id,id,data) VALUES ($1,$2,$3) ON CONFLICT (tenant_id,id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [id, dId, JSON.stringify(d)]);
      }
      for (const [cat, dep] of Object.entries(t.categoryDepartment)) {
        await this.db.query(`INSERT INTO categories (tenant_id,id,data,department_id) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,id) DO UPDATE SET data=EXCLUDED.data, department_id=EXCLUDED.department_id, updated_at=now()`,
          [id, cat, JSON.stringify({ id: cat, label: t.categoryDepartmentLabel[cat] ?? null }), dep]);
      }
      for (const ps of t.policeStations) {
        await this.db.query(`INSERT INTO police_stations (tenant_id,id,data,district,lat,lng) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (tenant_id,id) DO UPDATE SET data=EXCLUDED.data, district=EXCLUDED.district, lat=EXCLUDED.lat, lng=EXCLUDED.lng, updated_at=now()`,
          [id, ps.id, JSON.stringify(ps), ps.district, ps.geo.lat, ps.geo.lng]);
      }
    }
    for (const r of ROLES) await this.db.query(`INSERT INTO roles (id, description) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, [r, r.replace("_", " ")]);
  }

  /** Load one tenant's rows into its store. Returns true if any data existed. */
  async load(tenantId: string): Promise<boolean> {
    const state: Record<string, Row[]> = {};
    let any = false;
    for (const m of MAPPINGS) {
      const rows = (await this.db.query<{ data: Row }>(`SELECT data FROM ${m.table} WHERE tenant_id=$1`, [tenantId])).map(r => r.data);
      if (m.sort) rows.sort(m.sort);
      state[m.coll] = rows;
      any ||= rows.length > 0;
    }
    const recs = await this.db.query<{ collection: string; data: Row }>(`SELECT collection, data FROM records WHERE tenant_id=$1`, [tenantId]);
    let anchor: Row | undefined;
    for (const r of recs) {
      if (r.collection === "auditAnchor") { anchor = r.data; continue; }
      (state[r.collection] ??= []).push(r.data);
    }
    // Chronological order for generic collections (review P1-L4): use their timestamp field.
    const tsField = (r: Row) => String(r.sentAt ?? r.reportedAt ?? r.postedAt ?? r.createdAt ?? r.at ?? r.filedAt ?? "");
    const newestFirst = new Set(["polls", "petitions", "civicEvents", "safetyIncidents", "nightSafetyZones"]);
    for (const [coll, rows] of Object.entries(state)) {
      if (MAPPINGS.some(m => m.coll === coll)) continue;
      rows.sort((a, b) => newestFirst.has(coll) ? tsField(b).localeCompare(tsField(a)) : tsField(a).localeCompare(tsField(b)));
    }
    any ||= recs.length > 0;
    const store = storeFor(tenantId);
    // Rows at or before the anchor are archived (kept in Postgres, verified via the anchor hash) — keep memory bounded.
    if (anchor && state.auditLogs) state.auditLogs = state.auditLogs.filter(r => Number(r.seq ?? 0) > Number(anchor!.seq ?? 0));
    if (any) store.loadSnapshot({ version: 1, state: anchor ? { ...state, auditAnchor: anchor } : state });
    // remember what is in the DB so the first flush only writes real changes
    const snap = store.toSnapshot().state as unknown as Record<string, Row[]>;
    this.saved.set(tenantId, this.indexState(tenantId, snap));
    this.revisions.set(tenantId, store.revision);
    return any;
  }

  private keyFor(coll: string): ((r: Row) => string) | null {
    return MAPPINGS.find(m => m.coll === coll)?.key ?? RECORD_KEYS[coll] ?? (r => (r.id !== undefined ? String(r.id) : hashRow(r)));
  }

  private indexState(tenantId: string, state: Record<string, Row[]>) {
    const out = new Map<string, Map<string, string>>();
    runInTenant(tenantId, () => {
      for (const [coll, rows] of Object.entries(state)) {
        if (!Array.isArray(rows)) continue;
        const k = this.keyFor(coll)!;
        out.set(coll, new Map(rows.map(r => [k(r), hashRow(r)])));
      }
    });
    return out;
  }

  /** Write every changed row of every tenant store (one transaction per tenant). */
  /** Tenants whose last flush failed (review P1-C2) — /readyz reports not-ready while non-empty. */
  failing = new Map<string, string>();

  async flush(): Promise<void> {
    // If a flush is running, wait for it and then flush again so nothing written meanwhile is missed (review P1-M6).
    while (this.flushing) await this.flushing.catch(() => undefined);
    this.flushing = (async () => {
      for (const store of allStores()) {
        if (this.revisions.get(store.tenantId) === store.revision) continue;
        const rev = store.revision;
        try {
          await this.flushTenant(store);
          this.revisions.set(store.tenantId, rev);
          this.failing.delete(store.tenantId);
        } catch (err) {
          // One tenant's failure never blocks the others.
          this.failing.set(store.tenantId, (err as Error).message);
          logger.error("db_flush_failed", { tenant: store.tenantId, err: (err as Error).message });
        }
      }
    })();
    try { await this.flushing; } finally { this.flushing = null; }
  }

  /** Flush repeatedly until every store is persisted at its current revision (used on shutdown). */
  async flushUntilStable(maxRounds = 5): Promise<void> {
    for (let i = 0; i < maxRounds; i++) {
      await this.flush();
      if (allStores().every(s => this.revisions.get(s.tenantId) === s.revision)) return;
    }
  }

  private async flushTenant(store: AppStorage) {
    const tid = store.tenantId;
    const state = store.toSnapshot().state as unknown as Record<string, Row[]>;
    const prev = this.saved.get(tid) ?? new Map<string, Map<string, string>>();
    const next = this.indexState(tid, state);
    const json = (r: unknown) => JSON.stringify(r).replace(/\\u0000/g, "");
    await this.db.transaction(async tx => {
      await runInTenant(tid, async () => {
        // Deletes first, so a re-created unique key (e.g. same phone after erasure) does not collide (review P1-C2).
        for (const [coll, rows] of Object.entries(state)) {
          if (!Array.isArray(rows) || coll === "auditLogs") continue; // audit rows are never deleted (review P1-H3)
          const m = MAPPINGS.find(x => x.coll === coll);
          const before = prev.get(coll) ?? new Map<string, string>();
          const now = next.get(coll)!;
          for (const k of before.keys()) {
            if (now.has(k)) continue;
            if (m) await tx.query(`DELETE FROM ${m.table} WHERE tenant_id=$1 AND id=$2`, [tid, k]);
            else await tx.query(`DELETE FROM records WHERE tenant_id=$1 AND collection=$2 AND id=$3`, [tid, coll, k]);
          }
        }
        const anchor = (state as unknown as { auditAnchor?: unknown }).auditAnchor;
        if (anchor) await tx.query(`INSERT INTO records (tenant_id,collection,id,data) VALUES ($1,'auditAnchor','anchor',$2) ON CONFLICT (tenant_id,collection,id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [tid, json(anchor)]);
        for (const [coll, rows] of Object.entries(state)) {
          if (!Array.isArray(rows)) continue;
          const m = MAPPINGS.find(x => x.coll === coll);
          const key = this.keyFor(coll)!;
          const before = prev.get(coll) ?? new Map<string, string>();
          const now = next.get(coll)!;
          for (const r of rows) {
            const k = key(r);
            if (before.get(k) === now.get(k)) continue;
            if (m) {
              const cols = m.cols ? m.cols(r) : {};
              const names = ["tenant_id", "id", "data", ...Object.keys(cols)];
              const vals = [tid, k, json(r), ...Object.values(cols)];
              const set = ["data=EXCLUDED.data", "updated_at=now()", ...Object.keys(cols).map(c => `${c}=EXCLUDED.${c}`)].join(", ");
              await tx.query(`INSERT INTO ${m.table} (${names.join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT (tenant_id,id) DO UPDATE SET ${set}`, vals);
            } else {
              await tx.query(`INSERT INTO records (tenant_id,collection,id,data) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,collection,id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [tid, coll, k, json(r)]);
            }
          }
        }
      });
    });
    this.saved.set(tid, next);
  }

  async close() { await this.db.close(); }
}

// ── lifecycle used by server/persistence-driver.ts ────────────────────────────
let active: PgPersistence | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export async function startPostgres(): Promise<string[]> {
  const url = config().DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for STORAGE_DRIVER=postgres");
  const db = await openDb(url);
  const applied = await migrate(db);
  if (applied.length) logger.info("db_migrated", { applied });
  active = new PgPersistence(db);
  await active.syncReference();
  const restored: string[] = [];
  for (const id of tenantIds()) if (await active.load(id)) restored.push(id);
  timer = setInterval(() => { active?.flush().catch(err => logger.error("db_flush_failed", { err })); }, 300);
  unref(timer);
  return restored;
}

export async function stopPostgres(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  if (active) { await active.flushUntilStable(); await active.close(); }
  active = null;
}

/** Readiness probe (P1.10). */
export async function pingPostgres(): Promise<boolean> {
  if (!active) return false;
  if (active.failing.size) return false;
  try { await (active as unknown as { db: Db }).db.query("SELECT 1"); return true; } catch { return false; }
}
