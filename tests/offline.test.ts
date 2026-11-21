import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

const mem = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async (k: string) => mem.get(k) ?? null, setItem: async (k: string, v: string) => { mem.set(k, v); }, removeItem: async (k: string) => { mem.delete(k); } },
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

  it("outbox: keeps items while offline, sends them once online, moves real validation errors to failed", async () => {
    await Outbox.enqueue("userA", { id: "aaaaaaaaaaaa", path: "/api/complaints", method: "POST", body, label: "pothole" });
    await Outbox.enqueue("userA", { id: "bbbbbbbbbbbb", path: "/api/complaints", method: "POST", body: { bad: true }, label: "bad" });
    const offline = async () => { throw new TypeError("Network request failed"); };
    expect(await Outbox.flush("userA", offline)).toEqual({ sent: 0, failed: 0 });
    expect(await Outbox.pending("userA")).toHaveLength(2);
    const sent: string[] = [];
    const online = async (_p: string, _m: string, b: unknown) => {
      const x = b as { clientRequestId: string; bad?: boolean };
      sent.push(x.clientRequestId);
      return x.bad ? { ok: false, status: 400, json: async () => ({ message: "Invalid input" }) } : { ok: true, status: 201, json: async () => ({ id: "server-1" }) };
    };
    expect((await Outbox.flush("userA", online)).sent).toBe(0); // backoff respected
    expect(await Outbox.flush("userA", online, undefined, true)).toEqual({ sent: 1, failed: 1 });
    expect(sent).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
    expect(await Outbox.pending("userA")).toHaveLength(0);
    expect((await Outbox.failed("userA"))[0].error).toBe("Invalid input");
    await Outbox.retryFailed("userA", "bbbbbbbbbbbb");
    expect(await Outbox.pending("userA")).toHaveLength(1);
  });

  it("review P5-3: another user on the same phone never sees or sends someone else's queue", async () => {
    await Outbox.enqueue("userA", { id: "cccccccccccc", path: "/api/complaints", method: "POST", body, label: "A's report" });
    expect(await Outbox.pending("userB")).toHaveLength(0);
    const seen: string[] = [];
    await Outbox.flush("userB", async (_p, _m, b) => { seen.push((b as { clientRequestId: string }).clientRequestId); return { ok: true, status: 201, json: async () => ({}) }; }, undefined, true);
    expect(seen).toEqual([]);
    expect(await Outbox.pending("userA")).toHaveLength(1);
  });

  it("review P5-4: 401/403/428 keep the item (refresh / consent can fix them)", async () => {
    await Outbox.enqueue("userA", { id: "dddddddddddd", path: "/api/complaints", method: "POST", body, label: "x" });
    for (const status of [401, 403, 428]) {
      await Outbox.flush("userA", async () => ({ ok: false, status, json: async () => ({}) }), undefined, true);
      expect(await Outbox.pending("userA")).toHaveLength(1);
    }
    expect(await Outbox.failed("userA")).toHaveLength(0);
  });

  it("review P5-5: oversized items are refused up front; a corrupt index is never treated as empty", async () => {
    await expect(Outbox.enqueue("userA", { id: "eeeeeeeeeeee", path: "/api/complaints", method: "POST", body: { beforePhoto: "x".repeat(Outbox.MAX_ITEM_BYTES) }, label: "big" })).rejects.toThrow(/too large/);
    mem.set("sankalp_outbox_v2:userA:pending", "{corrupt");
    await expect(Outbox.enqueue("userA", { id: "ffffffffffff", path: "/api/complaints", method: "POST", body, label: "y" })).rejects.toThrow();
  });

  it("classifies network errors", () => {
    expect(Outbox.isNetworkError(new TypeError("Network request failed"))).toBe(true);
    expect(Outbox.isNetworkError(Object.assign(new Error("Bad"), { status: 400 }))).toBe(false);
  });
});
