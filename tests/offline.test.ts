import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

const mem = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async (k: string) => mem.get(k) ?? null, setItem: async (k: string, v: string) => { mem.set(k, v); } },
}));

import * as Outbox from "../lib/offline-queue";
import { storage } from "../server/storage";
import { app, stopApp, makeUser, auth } from "./helpers";

beforeEach(() => { storage.reset(); mem.clear(); });
afterAll(() => stopApp());

const body = { category: "pothole", description: "Large pothole near the bus stand", location: "Rajpur Road", geo: { lat: 30.33, lng: 78.06 } };

describe("P5.1 offline-first complaints", () => {
  it("server: the same clientRequestId never creates a second complaint", async () => {
    const u = await makeUser();
    const id = Outbox.newClientId();
    const a = await request(app()).post("/api/complaints").set(auth(u.token)).send({ ...body, clientRequestId: id });
    const b = await request(app()).post("/api/complaints").set(auth(u.token)).send({ ...body, clientRequestId: id });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect(storage.getComplaints()).toHaveLength(1);
    // another user with the same id is a different request
    const v = await makeUser();
    expect((await request(app()).post("/api/complaints").set(auth(v.token)).send({ ...body, clientRequestId: id })).status).toBe(201);
  });

  it("outbox: keeps items while offline, sends them once online, moves 4xx to failed", async () => {
    await Outbox.enqueue({ id: "aaaaaaaaaaaa", path: "/api/complaints", method: "POST", body, label: "pothole" });
    await Outbox.enqueue({ id: "bbbbbbbbbbbb", path: "/api/complaints", method: "POST", body: { bad: true }, label: "bad" });
    const offline = async () => { throw new TypeError("Network request failed"); };
    expect(await Outbox.flush(offline)).toEqual({ sent: 0, failed: 0 });
    expect(await Outbox.pending()).toHaveLength(2);
    // backoff: items are not retried immediately
    const sent: string[] = [];
    const online = async (_p: string, _m: string, b: unknown) => {
      const x = b as { clientRequestId: string; bad?: boolean };
      sent.push(x.clientRequestId);
      return x.bad ? { ok: false, status: 400, json: async () => ({ message: "Invalid input" }) } : { ok: true, status: 201, json: async () => ({ id: "server-1" }) };
    };
    expect((await Outbox.flush(online)).sent).toBe(0);
    for (const k of [...mem.keys()]) {
      const items = JSON.parse(mem.get(k)!) as Outbox.OutboxItem[];
      mem.set(k, JSON.stringify(items.map(i => ({ ...i, nextAttemptAt: 0 }))));
    }
    expect(await Outbox.flush(online)).toEqual({ sent: 1, failed: 1 });
    expect(sent).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
    expect(await Outbox.pending()).toHaveLength(0);
    expect((await Outbox.failed())[0].error).toBe("Invalid input");
  });

  it("classifies network errors", () => {
    expect(Outbox.isNetworkError(new TypeError("Network request failed"))).toBe(true);
    expect(Outbox.isNetworkError(Object.assign(new Error("Bad"), { status: 400 }))).toBe(false);
  });
});
