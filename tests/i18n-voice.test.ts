import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));

import { t, setLanguage, LANGUAGES } from "../lib/i18n";
import en from "../locales/en.json";
import { app, stopApp, makeUser, auth, M4A_HEADER, PNG_1PX } from "./helpers";

afterAll(() => stopApp());

describe("P5.4 i18n", () => {
  it("switches language, falls back hi → en, and lists Garhwali/Kumaoni as needs_review", async () => {
    await setLanguage("en");
    expect(t("tab.reports")).toBe("Reports");
    await setLanguage("hi");
    expect(t("tab.reports")).toBe("शिकायतें");
    await setLanguage("gbm");
    expect(t("complaint.submit")).toBe("शिकैत भेजा");
    expect(t("tab.home")).toBe("होम"); // not yet adapted → Hindi
    // Only English and Hindi are complete; every other language is a draft until native speakers sign off.
    expect(LANGUAGES.filter(l => !l.needsReview).map(l => l.code)).toEqual(["en", "hi"]);
    expect(LANGUAGES.filter(l => l.needsReview).map(l => l.code)).toEqual(expect.arrayContaining(["gbm", "kfy", "ta", "te", "bn", "mr", "gu", "kn", "ml", "pa", "or", "as"]));
    expect(Object.keys(en).length).toBeGreaterThan(40);
    await setLanguage("en");
  });
});

describe("P5.5 voice complaint transcription", () => {
  it("validates audio and reports 'unavailable' without a sovereign STT key (never a foreign fallback)", async () => {
    const u = await makeUser();
    expect((await request(app()).post("/api/ai/transcribe").set(auth(u.token)).send({ audioBase64: PNG_1PX })).status).toBe(422);
    const r = await request(app()).post("/api/ai/transcribe").set(auth(u.token)).send({ audioBase64: M4A_HEADER });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: "unavailable", transcript: null });
  });
});

describe("m17 Indian input", () => {
  it("normalises +91/0/spaced numbers on the server and client", async () => {
    const { normalizeIndianMobile, isPincode, toE164 } = await import("../lib/india");
    for (const v of ["+91 98765-43210", "098765 43210", "919876543210", "(98765) 43210"]) expect(normalizeIndianMobile(v)).toBe("9876543210");
    expect(toE164("98765 43210")).toBe("+919876543210");
    expect([isPincode("248001"), isPincode("048001"), isPincode("24800")]).toEqual([true, false, false]);
    const r = await request(app()).post("/api/auth/register").send({ name: "Spaced Phone", phone: "+91 90000 77777", pin: "135791", district: "Dehradun" });
    expect(r.status).toBe(200);
    expect(r.body.user.phone).toBe("9000077777");
  });
});
