import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { trainingManifest } from "../server/routes/privacy";
import { config, setConfig, loadConfig } from "../server/config";
import { vision } from "../server/ai/gateway";
import { app, stopApp, makeUser, auth } from "./helpers";

/** Own-model training data: separate opt-in, real labels only, state admins only, no GPS (EXIF-stripped copies). */
beforeEach(() => storage.reset());
afterAll(() => stopApp());

function seed(userId: string, over: Record<string, unknown>) {
  const id = `c-${Math.random().toString(36).slice(2)}`;
  storage.s.complaints.push({ id, userId, category: "pothole", district: "Dehradun", state: "CLOSED", beforePhoto: "/uploads/11111111-1111-1111-1111-111111111111.jpg",
    proofPhoto: "/uploads/22222222-2222-2222-2222-222222222222.jpg", citizenAnswer: "yes", ...over } as never);
}

describe("AI training data", () => {
  it("is off by default and only includes people who opt in, with real labels", async () => {
    const yes = await makeUser("citizen", "Dehradun");
    const no = await makeUser("citizen", "Dehradun");
    expect((await request(app()).get("/api/privacy/training-consent").set(auth(yes.token))).body.allow).toBe(false);
    expect((await request(app()).put("/api/privacy/training-consent").set(auth(yes.token)).send({ allow: true })).status).toBe(200);
    seed(yes.user.id, {});
    seed(yes.user.id, { state: "NEW", citizenAnswer: undefined, proofPhoto: undefined }); // not worked by an officer → no label
    seed(no.user.id, {});
    const m = trainingManifest();
    expect(m.contributors).toBe(1);
    expect(m.items).toEqual([
      expect.objectContaining({ task: "scene", label: "pothole" }),
      expect.objectContaining({ task: "fixed", label: "fixed" }),
    ]);
    for (const it of m.items) expect(it.url).toMatch(/^\/uploads\//); // public, EXIF-stripped copy — never originals
    await request(app()).put("/api/privacy/training-consent").set(auth(yes.token)).send({ allow: false });
    expect(trainingManifest().items).toHaveLength(0);
  });

  it("export is for state admins only and is audited", async () => {
    const c = await makeUser("citizen", "Dehradun");
    expect((await request(app()).get("/api/admin/training-export").set(auth(c.token))).status).toBe(403);
    const admin = await makeUser("state_admin", "Dehradun");
    const r = await request(app()).get("/api/admin/training-export").set(auth(admin.token));
    expect(r.status).toBe(200);
    expect(storage.s.auditLogs.some(l => l.action === "training_export")).toBe(true);
  });
});

describe("self-hosted vision (own Patram-7B server)", () => {
  const before = config();
  afterEach(() => { setConfig(before); globalThis.fetch = fetchReal; });
  const fetchReal = globalThis.fetch;
  it("sends the bearer key to the self-hosted server", async () => {
    setConfig({ ...loadConfig({ JWT_SECRET: "a".repeat(32), DEPT_JWT_SECRET: "b".repeat(32), AI_VISION_PROVIDER: "selfhosted", AI_VISION_BASE_URL: "https://gpu.example.in/v1", AI_VISION_MODEL: "patram-7b-instruct", AI_VISION_API_KEY: "k123" }), EGRESS_ALLOWLIST: ["gpu.example.in"] });
    let h: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_u: string | URL, init?: RequestInit) => { h = init?.headers as Record<string, string>; return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }); }) as typeof fetch;
    const r = await vision("aGVsbG8=", "What is this?");
    expect(r?.provider).toBe("selfhosted-vision");
    expect(r?.model).toBe("patram-7b-instruct");
    expect(h.Authorization).toBe("Bearer k123");
  });
});
