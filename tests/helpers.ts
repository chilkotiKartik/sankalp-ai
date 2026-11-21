import bcrypt from "bcrypt";
import request from "supertest";
import { createApp, type Built } from "../server/app";
import { storage, type AppUser } from "../server/storage";
import { closeRealtime } from "../server/realtime";
import { signDeptToken } from "../server/lib/route";
import { tenant } from "../server/tenancy";

export const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
export const M4A_HEADER = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A "), Buffer.alloc(64)]).toString("base64");

let built: Built | null = null;
export function app() {
  if (!built) built = createApp();
  return built.app;
}
export function server() {
  app();
  return built!.server;
}
export function stopApp() {
  closeRealtime();
  built?.server.close();
  built = null;
}

let seq = 0;
/** Placeholder phones only (+91 90000 0000x style) — never real numbers. */
export function nextPhone() {
  seq += 1;
  return `90000${String(10000 + seq).slice(-5)}`;
}

export async function makeUser(role: AppUser["role"] = "citizen", district = "Dehradun", pin = "135792", opts: { consent?: boolean } = {}) {
  const user = await storage.createUser({ name: `${role}-${seq}`, phone: nextPhone(), pin: await bcrypt.hash(pin, 4), role, district, points: 0, badges: [], level: 1 });
  if (opts.consent !== false) storage.recordConsent(user.id, tenant().privacy.noticeVersion, "en");
  return { user, token: storage.createToken(user.id), pin };
}

/** Mints a department session directly (login itself is covered in api.security tests). */
export async function deptToken(dept: string) {
  if (!storage.deptCredentialVersion(dept)) await storage.rotateDeptCode(dept);
  return signDeptToken(dept);
}

export const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

export async function fileComplaint(token: string, extra: Record<string, unknown> = {}) {
  const res = await request(app()).post("/api/complaints").set(auth(token))
    .send({ category: "pothole", description: "Large pothole near the bus stand", location: "Rajpur Road", geo: { lat: 30.33, lng: 78.06 }, ...extra });
  if (res.status !== 201) throw new Error(`fileComplaint ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
