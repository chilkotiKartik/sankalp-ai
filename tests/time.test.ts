import { describe, it, expect } from "vitest";
import { istDayKey, startOfIstDay, isSameIstDay, istWeekOfYear, hoursBetween } from "../server/lib/time";
import { AppStorage } from "../server/storage";

describe("m9 UTC storage, IST business rules", () => {
  it("IST midnight is 18:30 UTC of the previous day", () => {
    expect(istDayKey("2026-11-21T18:29:59Z")).toBe("2026-11-21");
    expect(istDayKey("2026-11-21T18:30:00Z")).toBe("2026-11-22");
    expect(new Date(startOfIstDay("2026-11-22T02:00:00Z")).toISOString()).toBe("2026-11-21T18:30:00.000Z");
  });

  it("two events 10 minutes apart across IST midnight are on different IST days", () => {
    expect(isSameIstDay("2026-11-21T18:25:00Z", "2026-11-21T18:35:00Z")).toBe(false);
    expect(isSameIstDay("2026-11-21T10:00:00Z", "2026-11-21T18:00:00Z")).toBe(true);
  });

  it("year boundary and week numbers use IST", () => {
    expect(istDayKey("2026-12-31T19:00:00Z")).toBe("2027-01-01");
    expect(istWeekOfYear("2027-01-04T00:00:00Z")).toBe(1);
  });

  it("SLA uses elapsed hours, independent of the clock's timezone", () => {
    expect(hoursBetween("2026-11-21T18:00:00Z", "2026-11-22T18:00:00Z")).toBe(24);
    const s = new AppStorage();
    const c = { state: "NEW", priority: "P1", submittedAt: "2026-11-21T18:00:00Z" } as never;
    expect(s.slaBreached(c, Date.parse("2026-11-22T17:59:00Z"))).toBe(false);
    expect(s.slaBreached(c, Date.parse("2026-11-22T18:01:00Z"))).toBe(true);
  });
});
