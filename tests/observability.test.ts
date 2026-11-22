import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, stopApp } from "./helpers";
import { readiness } from "../server/health";

afterAll(() => stopApp());

describe("P1.10 observability", () => {
  it("every response carries a request id; a sane upstream id is propagated, junk is replaced", async () => {
    const a = await request(app()).get("/api/health");
    expect(a.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    const b = await request(app()).get("/api/health").set("X-Request-Id", "lb-trace-12345678");
    expect(b.headers["x-request-id"]).toBe("lb-trace-12345678");
    const c = await request(app()).get("/api/health").set("X-Request-Id", "<script>");
    expect(c.headers["x-request-id"]).not.toBe("<script>");
  });

  it("/readyz reports storage and tenant checks", async () => {
    const r = await request(app()).get("/readyz");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ready: true, checks: { tenants: true, dataDir: true } });
    expect((await readiness()).ready).toBe(true);
  });
});
