import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage, cprEmitter } from "../server/storage";
import { runAudioRetention } from "../server/routes/privacy";
import { app, stopApp, makeUser, auth, deptToken, M4A_HEADER } from "./helpers";

/** SOS voice: 10-second clips reach the police live, can be kept as evidence, and are deleted after 5 days otherwise. */
beforeEach(() => storage.reset());
afterAll(() => stopApp());

async function sosWithClip() {
  const c = await makeUser("citizen", "Dehradun");
  const sos = (await request(app()).post("/api/sos/women-safety").set(auth(c.token)).send({ geo: { lat: 30.31, lng: 78.03 } })).body.alert;
  const up = await request(app()).post("/api/upload/audio").set(auth(c.token)).send({ audio: M4A_HEADER, sosId: sos.id });
  expect(up.status).toBe(200);
  const events: Array<{ type: string; incidentId?: string }> = [];
  const on = (e: (typeof events)[number]) => events.push(e);
  cprEmitter.on("event", on);
  const ch = await request(app()).put(`/api/sos/${sos.id}/audio-chunk`).set(auth(c.token)).send({ chunkUrl: up.body.url, chunkIndex: 0, duration: 10 });
  cprEmitter.off("event", on);
  expect(ch.status).toBe(200);
  return { c, sos, file: up.body.filename as string, events };
}

describe("SOS voice clips", () => {
  it("links the police incident to the SOS and tags each clip with the incident", async () => {
    const { sos, events } = await sosWithClip();
    const inc = storage.s.safetyIncidents.find(i => i.id === sos.cprRequestId)!;
    expect(inc.sosId).toBe(sos.id);
    expect(events.find(e => e.type === "audio_chunk")?.incidentId).toBe(sos.cprRequestId);
    const police = await deptToken("police");
    const list = await request(app()).get(`/api/sos/${sos.id}/audio-chunks`).set(auth(police));
    expect(list.status).toBe(200);
    expect(list.body.audioChunks).toHaveLength(1);
  });

  it("deletes voice clips 5 days after recording once the SOS is closed — never while it is open", async () => {
    const { c, sos, file } = await sosWithClip();
    expect(runAudioRetention(Date.now() + 30 * 86400000)).toBe(0); // still open → kept
    await request(app()).put(`/api/sos/${sos.id}/cancel`).set(auth(c.token)).send({ pin: c.pin });
    expect(runAudioRetention(Date.now() + 4 * 86400000)).toBe(0);
    expect(runAudioRetention(Date.now() + 6 * 86400000)).toBe(1);
    expect(storage.getMediaByFile(file)).toBeUndefined();
    expect(storage.getSOSAlert(sos.id)!.audioChunks).toEqual([]);
    expect(storage.s.auditLogs.some(l => l.action === "sos_audio_purged")).toBe(true);
  });

  it("keeps clips that police put under legal hold", async () => {
    const { sos, file } = await sosWithClip();
    const police = await deptToken("police");
    const h = await request(app()).put(`/api/sos/${sos.id}/legal-hold`).set(auth(police)).send({ hold: true, reason: "Kept as evidence" });
    expect(h.status).toBe(200);
    expect(runAudioRetention(Date.now() + 30 * 86400000)).toBe(0);
    expect(storage.getMediaByFile(file)).toBeDefined();
  });
});

describe("SOS cancel closes the police incident", () => {
  it("marks the incident safe when the person cancels with the right PIN, and not on a wrong PIN", async () => {
    const c = await makeUser("citizen", "Dehradun");
    const sos = (await request(app()).post("/api/sos/women-safety").set(auth(c.token)).send({ geo: { lat: 30.31, lng: 78.03 } })).body.alert;
    const inc = () => storage.s.safetyIncidents.find(i => i.id === sos.cprRequestId)!;
    await request(app()).put(`/api/sos/${sos.id}/cancel`).set(auth(c.token)).send({ pin: "000000" });
    expect(inc().status).not.toBe("safe");
    const ok = await request(app()).put(`/api/sos/${sos.id}/cancel`).set(auth(c.token)).send({ pin: c.pin, reason: "safe now" });
    expect(ok.status).toBe(200);
    expect(inc().status).toBe("safe");
    expect(inc().updates.at(-1)!.actor).toBe("CITIZEN");
  });
});
