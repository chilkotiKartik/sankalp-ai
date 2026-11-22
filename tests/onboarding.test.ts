import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import request from "supertest";
import { buildTenantConfig, parseCsv, OnboardError } from "../server/onboarding";
import { registerTenant, runInTenant } from "../server/tenancy";
import { storeFor } from "../server/storage";
import { app, stopApp, auth } from "./helpers";

afterAll(() => stopApp());

const opts = { id: "examplestate", name: "Example State", stateLabel: "Example State", prefix: "EX", defaultDistrict: "Example District", languages: ["hi", "en"],
  grievance: { name: "Officer", email: "g@example.gov.in", phone: "1800", address: "Secretariat" } };

describe("P7.1 tenant onboarding", () => {
  it("parses quoted CSV fields", () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\r\n')).toEqual([{ a: "x, y", b: 'he said "hi"' }]);
  });

  it("builds a valid config from the templates, and the new state goes live by configuration only", async () => {
    const cfg = buildTenantConfig("config/tenants/templates", opts);
    expect(cfg.categoryDepartment.pothole).toBe("pwd");
    expect(cfg.retention.needsLegalConfirmation).toBe(true);
    registerTenant(cfg);
    const reg = await request(app()).post("/api/auth/register").set("X-Tenant", "examplestate").send({ name: "New State User", phone: "9000066601", pin: "135791", district: "Example District" });
    expect(reg.status).toBe(200);
    const v = (await request(app()).get("/api/public/privacy-notice").set("X-Tenant", "examplestate")).body.version;
    await request(app()).post("/api/privacy/consent").set("X-Tenant", "examplestate").set(auth(reg.body.token)).send({ version: v, accepted: true });
    const c = await request(app()).post("/api/complaints").set("X-Tenant", "examplestate").set(auth(reg.body.token))
      .send({ category: "water", description: "No water supply since morning", location: "Main road", geo: { lat: 20.001, lng: 78.001 } });
    expect(c.status).toBe(201);
    expect(c.body.ticketId.startsWith("EX-")).toBe(true);
    expect(runInTenant("examplestate", () => storeFor("examplestate").getComplaint(c.body.id)?.aiRouting?.department)).toBe("water");
  });

  it("reports every problem with file and row, and writes nothing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onb-"));
    for (const f of fs.readdirSync("config/tenants/templates")) fs.copyFileSync(path.join("config/tenants/templates", f), path.join(dir, f));
    fs.appendFileSync(path.join(dir, "wards.csv"), "Bad Ward,2,X,Nowhere,abc,78,100\n");
    try {
      buildTenantConfig(dir, opts);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(OnboardError);
      const p = (err as OnboardError).problems.join("\n");
      expect(p).toContain('wards.csv row 3: unknown district "Nowhere"');
      expect(p).toContain("wards.csv row 3: lat must be a number");
    }
    expect(() => buildTenantConfig(dir, { ...opts, defaultDistrict: "Missing" })).toThrow(/default-district/);
  });
});

describe("Phase 7 review: onboarding rejects malformed data", () => {
  it("duplicates, unknown categories, bad SLA, unknown wards and missing emergency departments", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onb2-"));
    for (const f of fs.readdirSync("config/tenants/templates")) fs.copyFileSync(path.join("config/tenants/templates", f), path.join(dir, f));
    fs.appendFileSync(path.join(dir, "departments.csv"), "pwd,PWD2,x,x,#000,1,-5,Pothole|made_up\n");
    fs.appendFileSync(path.join(dir, "districts.csv"), "Example District ,21,79\n");
    fs.appendFileSync(path.join(dir, "wards.csv"), "Dup Ward,1,X,Example District,20,78,1\n");
    fs.appendFileSync(path.join(dir, "police_stations.csv"), "ps1,Again,Road,112,20,78,No Such Ward,Example District\n");
    const p = (() => { try { buildTenantConfig(dir, opts); return ""; } catch (e) { return (e as OnboardError).problems.join("\n"); } })();
    for (const want of ['duplicate department id "pwd"', 'unknown category "Pothole"', 'unknown category "made_up"', "slaHours must be greater than 0", "duplicate district", "ward number 1 repeats", 'duplicate id "ps1"', 'unknown ward "No Such Ward"']) expect(p).toContain(want);
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "onb3-"));
    for (const f of fs.readdirSync("config/tenants/templates")) fs.copyFileSync(path.join("config/tenants/templates", f), path.join(d2, f));
    fs.writeFileSync(path.join(d2, "departments.csv"), fs.readFileSync(path.join(d2, "departments.csv"), "utf8").split("\n").filter(l => !l.startsWith("usdma")).join("\n"));
    expect(() => buildTenantConfig(d2, opts)).toThrow(/"usdma" is required/);
  });
});
