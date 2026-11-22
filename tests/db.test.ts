import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "../server/db/schema";
import { openDb, migrate, PgPersistence, type Db } from "../server/db/pg-driver";
import { storeFor } from "../server/storage";
import { runInTenant, registerTenant, tenant, loadTenants } from "../server/tenancy";

/** P1.1/P1.2 against a real PostgreSQL engine (PGlite in-process — no server, no Docker). */
let db: Db;
beforeAll(async () => {
  loadTenants();
  registerTenant({ ...tenant("uttarakhand"), id: "dbland", name: "DB Land", ticketPrefix: "DB" });
  db = await openDb("pglite:memory");
}, 60_000);
afterAll(async () => { await db.close(); });

const tables = (Object.values(schema) as unknown[])
  .filter(t => typeof t === "object" && t !== null && Symbol.for("drizzle:Name") in (t as object))
  .map(t => getTableConfig(t as PgTable).name);

describe("migrations", () => {
  it("apply once, are idempotent, and create every schema table", async () => {
    expect(await migrate(db)).toEqual(["0000_init.sql"]);
    expect(await migrate(db)).toEqual([]);
    const rows = await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const have = new Set(rows.map(r => r.table_name));
    for (const t of tables) expect(have.has(t), t).toBe(true);
    expect(tables.length).toBeGreaterThanOrEqual(21);
  });

  it("has the required indexes (tenant+status, tenant+created, geo, department+status)", async () => {
    const idx = (await db.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE tablename='complaints'")).map(r => r.indexname);
    expect(idx).toEqual(expect.arrayContaining(["complaints_tenant_status", "complaints_tenant_created", "complaints_geo", "complaints_dept_status"]));
  });

  it("the generated SQL matches the Drizzle schema (no drift)", () => {
    const sql = fs.readFileSync("server/db/migrations/0000_init.sql", "utf8");
    for (const t of tables) expect(sql).toContain(`CREATE TABLE "${t}"`);
  });
});

describe("Postgres persistence round trip", () => {
  it("writes, reloads, updates and deletes per tenant", async () => {
    const p = new PgPersistence(db);
    await p.syncReference();
    const ids = await runInTenant("uttarakhand", async () => {
      const s = storeFor("uttarakhand");
      s.reset();
      const u = await s.createUser({ name: "Pg Citizen", phone: "9000000901", pin: "x", role: "citizen", district: "Dehradun", points: 0, badges: [], level: 1 });
      const c = s.createComplaint({ category: "water", description: "No water since morning", location: "Clock Tower", geo: { lat: 30.32, lng: 78.04 }, ward: "w", wardNumber: 1, district: "Dehradun", priority: "P2" }, u);
      const tok = s.createToken(u.id);
      return { u: u.id, c: c.id, tok };
    });
    await runInTenant("dbland", async () => {
      const s = storeFor("dbland");
      s.reset();
      await s.createUser({ name: "Other Tenant", phone: "9000000901", pin: "x", role: "citizen", district: "Dehradun", points: 0, badges: [], level: 1 });
    });
    await p.flush();

    const rows = await db.query<{ tenant_id: string; status: string; department_id: string }>("SELECT tenant_id, status, department_id FROM complaints");
    expect(rows).toEqual([{ tenant_id: "uttarakhand", status: "NEW", department_id: "jal" }]);
    expect((await db.query("SELECT 1 FROM users WHERE phone='9000000901'")).length).toBe(2); // same phone, two tenants

    // reload into empty stores from a fresh persistence instance
    storeFor("uttarakhand").reset();
    storeFor("dbland").reset();
    const p2 = new PgPersistence(db);
    expect(await p2.load("uttarakhand")).toBe(true);
    await p2.load("dbland");
    const s = storeFor("uttarakhand");
    expect(runInTenant("uttarakhand", () => s.getComplaint(ids.c)?.category)).toBe("water");
    expect(runInTenant("uttarakhand", () => s.validateToken(ids.tok)?.id)).toBe(ids.u);
    expect(runInTenant("dbland", () => storeFor("dbland").getComplaints())).toHaveLength(0);

    // change + delete propagate, untouched rows are not rewritten
    const before = await db.query<{ updated_at: string }>("SELECT updated_at FROM users WHERE tenant_id='uttarakhand'");
    runInTenant("uttarakhand", () => { s.startWork(ids.c, "officer", "officer-1"); s.revokeToken(ids.tok); });
    await p2.flush();
    expect((await db.query<{ status: string }>("SELECT status FROM complaints WHERE id=$1", [ids.c]))[0].status).toBe("IN_PROGRESS");
    expect((await db.query("SELECT 1 FROM records WHERE collection='tokens' AND tenant_id='uttarakhand'")).length).toBe(0);
    const after = await db.query<{ updated_at: string }>("SELECT updated_at FROM users WHERE tenant_id='uttarakhand'");
    expect(after[0].updated_at).toEqual(before[0].updated_at);
    expect((await db.query("SELECT 1 FROM complaint_events WHERE tenant_id='uttarakhand'")).length).toBe(3);
  });
});

describe("review P1-C2/H3: flush robustness", () => {
  it("one tenant's failing flush never blocks another; deletes run before upserts; audit rows and anchor survive trimming", async () => {
    const p = new PgPersistence(db);
    await p.syncReference();
    await p.load("uttarakhand"); await p.load("dbland");
    const uk = storeFor("uttarakhand"), dl = storeFor("dbland");
    // Same phone re-registered after the old account was deleted: needs DELETE before INSERT.
    const first = await runInTenant("uttarakhand", () => uk.createUser({ name: "Phone Reuse", phone: "9000000955", pin: "x", role: "citizen", district: "Dehradun", points: 0, badges: [], level: 1 }));
    await p.flush();
    await runInTenant("uttarakhand", async () => {
      uk.s.users = uk.s.users.filter(u => u.id !== first.id);
      await uk.createUser({ name: "Phone Reuse 2", phone: "9000000955", pin: "x", role: "citizen", district: "Dehradun", points: 0, badges: [], level: 1 });
    });
    // dbland gets an impossible state (duplicate phone) → its flush fails …
    await runInTenant("dbland", async () => {
      const a = await dl.createUser({ name: "Dup A", phone: "9000000956", pin: "x", role: "citizen", district: "Dehradun", points: 0, badges: [], level: 1 });
      dl.s.users.push({ ...a, id: "dup-b" });
      dl.touch();
    });
    await p.flush();
    expect(p.failing.has("dbland")).toBe(true);
    expect(p.failing.has("uttarakhand")).toBe(false);
    expect((await db.query<{ name: string }>("SELECT data->>'name' AS name FROM users WHERE tenant_id='uttarakhand' AND phone='9000000955'"))[0].name).toBe("Phone Reuse 2");
    // … and recovers once fixed.
    runInTenant("dbland", () => { dl.s.users = dl.s.users.filter(u => u.id !== "dup-b"); dl.touch(); });
    await p.flush();
    expect(p.failing.size).toBe(0);

    // Audit: trimming the in-memory list never deletes rows; the anchor is persisted and reloaded.
    runInTenant("uttarakhand", () => { for (let i = 0; i < 3; i++) uk.addAuditLog("test_event", "system", "SANKALP System", `event ${i}`); });
    await p.flush();
    const n = (await db.query("SELECT 1 FROM audit_log WHERE tenant_id='uttarakhand'")).length;
    runInTenant("uttarakhand", () => {
      const last = uk.s.auditLogs[uk.s.auditLogs.length - 1];
      const dropped = uk.s.auditLogs[uk.s.auditLogs.length - 2];
      uk.s.auditAnchor = { seq: dropped.seq!, hash: dropped.hash! };
      uk.s.auditLogs = [last];
      uk.touch();
    });
    await p.flush();
    expect((await db.query("SELECT 1 FROM audit_log WHERE tenant_id='uttarakhand'")).length).toBe(n);
    uk.reset();
    await new PgPersistence(db).load("uttarakhand");
    expect(uk.s.auditAnchor?.seq).toBeGreaterThan(0);
    expect(uk.s.auditLogs.length).toBe(1);
    expect(runInTenant("uttarakhand", () => uk.verifyAuditChain().ok)).toBe(true);
  });
});
