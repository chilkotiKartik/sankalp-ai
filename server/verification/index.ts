import { z } from "zod";
import type { Complaint, ProofVerification, VerificationSignal } from "../types";
import { storage } from "../storage";
import { tenant } from "../tenancy";
import { readStored } from "../lib/media";
import { vision, extractJson } from "../ai/gateway";
import { readExif, haversineM, hamming } from "./image";
import { evaluate } from "./evaluate";
import { awaitFingerprint } from "./fingerprint";
export { evaluate, humanSignals } from "./evaluate";

/**
 * P3 Proof-of-Fix 2.0 — collects every signal for a complaint's proof and runs the decision engine.
 * All computation is local; the only optional model call is the self-hosted vision check (P3.4).
 */
export const REUSE_MAX_HAMMING = 8;
const SCENE_SAME = 12, SCENE_DIFFERENT = 28;

const fileOf = (url?: string) => url?.match(/\/uploads\/([0-9a-f-]{36}\.\w+)$/)?.[1];

function originalBytes(file?: string): Buffer | null {
  if (!file) return null;
  try { return readStored("originals", file) ?? readStored("public", file); } catch { return null; }
}

/** EXIF times have no zone; phones in India write IST. */
const exifToDate = (s: string) => new Date(`${s}+05:30`);

export interface ProofContext { proofGeo?: { lat: number; lng: number } }

export function collectMachineSignals(c: Complaint, ctx: ProofContext = {}): { signals: VerificationSignal[]; flags: string[] } {
  const v = tenant().verification;
  const signals: VerificationSignal[] = [];
  const flags: string[] = [];
  const proofFile = fileOf(c.proofPhoto);
  const beforeFile = fileOf(c.beforePhoto);
  const proofRec = proofFile ? storage.getMediaByFile(proofFile) : undefined;
  const beforeRec = beforeFile ? storage.getMediaByFile(beforeFile) : undefined;
  const bytes = originalBytes(proofFile);
  const exif = bytes ? readExif(bytes) : {};

  // P3.1 geo
  const R = v.proofRadiusM;
  const points: Array<{ src: string; d: number }> = [];
  if (c.geo && exif.lat !== undefined && exif.lng !== undefined) points.push({ src: "photo EXIF", d: haversineM(c.geo, { lat: exif.lat, lng: exif.lng }) });
  const deviceGeo = ctx.proofGeo ?? c.proofGeo;
  if (c.geo && deviceGeo) points.push({ src: "device GPS", d: haversineM(c.geo, deviceGeo) });
  if (c.geoApproximate) {
    // Review P3-3: the complaint location is only the district centre — distance to it means nothing.
    signals.push({ name: "geo", score: null, method: "haversine", detail: "Complaint was filed without GPS (district centre only)" });
  } else if (!points.length) {
    signals.push({ name: "geo", score: null, method: "haversine", detail: c.geo ? "No GPS in the proof photo or from the device" : "Complaint has no location" });
  } else {
    const best = points.reduce((a, b) => (a.d <= b.d ? a : b));
    const score = best.d <= R ? 1 : best.d >= 3 * R ? 0 : 1 - (best.d - R) / (2 * R);
    signals.push({ name: "geo", score: round(score), method: "haversine", detail: `${Math.round(best.d)} m from the complaint (${best.src}; limit ${R} m)` });
    if (best.d > 3 * R) flags.push("proof_far_from_site");
    if (points.length === 2 && Math.abs(points[0].d - points[1].d) > 3 * R) flags.push("gps_sources_disagree");
  }
  if (exif.takenAt && exifToDate(exif.takenAt).getTime() < new Date(c.submittedAt).getTime() - 86400000) flags.push("photo_taken_before_complaint");

  // P3.2 reuse
  if (!proofRec?.phash) {
    signals.push({ name: "reuse", score: null, method: "phash", detail: "Proof photo could not be fingerprinted" });
  } else {
    let hit: { d: number; what: string } | null = null;
    for (const m of storage.s.media) {
      if (!m.phash || m.fileName === proofRec.fileName) continue;
      const d = hamming(m.phash, proofRec.phash);
      if (d <= REUSE_MAX_HAMMING && (!hit || d < hit.d)) {
        hit = { d, what: m.fileName === beforeRec?.fileName ? "this complaint's own 'before' photo" : m.complaintId ? "a photo from another complaint" : "an earlier upload" };
      }
    }
    signals.push({ name: "reuse", score: hit ? 0 : 1, method: `phash≤${REUSE_MAX_HAMMING}`, detail: hit ? `Matches ${hit.what} (distance ${hit.d})` : "No match among this state's photos" });
    if (hit) flags.push(hit.what.startsWith("this complaint") ? "proof_is_before_photo" : "reused_photo");
  }

  // P3.3 same scene (background periphery)
  if (!proofRec?.sceneHash || !beforeRec?.sceneHash) {
    signals.push({ name: "scene", score: null, method: "periphery-hash", detail: beforeRec ? "Photos could not be compared" : "No 'before' photo to compare with" });
  } else {
    const d = hamming(proofRec.sceneHash, beforeRec.sceneHash);
    const score = d <= SCENE_SAME ? 1 : d >= SCENE_DIFFERENT ? 0 : 1 - (d - SCENE_SAME) / (SCENE_DIFFERENT - SCENE_SAME);
    signals.push({ name: "scene", score: round(score), method: "periphery-hash", detail: `Background distance ${d}/64 between before and after` });
  }
  return { signals, flags };
}

const visionAnswer = z.object({ fixed: z.boolean(), confidence: z.number().min(0).max(1) });

/** P3.4 change check — self-hosted vision only; unknown otherwise. */
export async function changeSignal(c: Complaint): Promise<VerificationSignal> {
  const bytes = originalBytes(fileOf(c.proofPhoto));
  if (!bytes) return { name: "change", score: null, method: "vision", detail: "No proof photo bytes" };
  const issue = c.category.replace(/_/g, " ");
  const r = await vision(bytes.toString("base64"),
    `This photo is offered as proof that a reported "${issue}" problem was repaired. Is the ${issue} problem visibly fixed in this photo? ` +
    `Reply ONLY with JSON: {"fixed":true|false,"confidence":0.0-1.0}`);
  const parsed = r ? visionAnswer.safeParse(extractJson(r.text)) : null;
  if (!r || !parsed?.success) return { name: "change", score: null, method: "vision", detail: r ? "Vision answer was not valid" : "No sovereign vision model configured" };
  const { fixed, confidence } = parsed.data;
  return { name: "change", score: round(fixed ? confidence : 1 - confidence), method: `vision:${r.model}`, detail: `Model says ${fixed ? "fixed" : "NOT fixed"} (${Math.round(confidence * 100)}%)` };
}

/** Full verification right after proof submission: machine signals (+ optional vision), then the engine. */
export async function verifyProof(c: Complaint, ctx: ProofContext = {}): Promise<ProofVerification> {
  if (ctx.proofGeo) c.proofGeo = ctx.proofGeo;
  await Promise.all([awaitFingerprint(fileOf(c.proofPhoto)), awaitFingerprint(fileOf(c.beforePhoto))]);
  const { signals, flags } = collectMachineSignals(c, ctx);
  signals.push(await changeSignal(c));
  c.verification = { engineVersion: "", signals, flags, score: null, coverage: 0, decision: "PENDING_CITIZEN", at: new Date().toISOString() };
  c.verification = evaluate(c);
  return c.verification;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
