import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-sensors", () => ({ Accelerometer: { setUpdateInterval: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) } }));

import { feedAcceleration, onShakeSOS, onShakeCount, resetShakeState, SHAKES_NEEDED } from "../lib/shake";

/** Shake-to-SOS: real shakes fire once; walking, a single drop or slow movement never do. */
describe("shake SOS detector", () => {
  beforeEach(() => resetShakeState());

  const shake = (n: number, start: number, gap = 300) => { for (let i = 0; i < n; i++) feedAcceleration(2.6, 0.4, 0.3, start + i * gap); };

  it(`fires after ${SHAKES_NEEDED} strong shakes, once`, () => {
    const fired = vi.fn(); const off = onShakeSOS(fired);
    shake(SHAKES_NEEDED - 1, 1_000);
    expect(fired).not.toHaveBeenCalled();
    shake(1, 1_000 + SHAKES_NEEDED * 300);
    expect(fired).toHaveBeenCalledTimes(1);
    shake(SHAKES_NEEDED + 1, 3_000); // the same long shake does not raise a second SOS
    expect(fired).toHaveBeenCalledTimes(1);
    off();
  });

  it("six shakes (more than needed) still work", () => {
    const fired = vi.fn(); const off = onShakeSOS(fired);
    shake(6, 50_000);
    expect(fired).toHaveBeenCalledTimes(1);
    off();
  });

  it("ignores gravity, walking and slow shakes", () => {
    const fired = vi.fn(); const off = onShakeSOS(fired);
    for (let t = 0; t < 10_000; t += 60) feedAcceleration(0.1, 0.98 + Math.sin(t / 300) * 0.4, 0.1, 100_000 + t); // walking
    shake(SHAKES_NEEDED, 200_000, 1_000); // too slow: spread over 5 seconds
    expect(fired).not.toHaveBeenCalled();
    off();
  });

  it("jitter within one jolt counts once, and the counter reports progress", () => {
    const counts: number[] = []; const off = onShakeCount(n => counts.push(n));
    feedAcceleration(2.6, 0, 0, 300_000); feedAcceleration(2.7, 0, 0, 300_060); feedAcceleration(2.5, 0, 0, 300_120);
    expect(counts).toEqual([1]);
    off();
  });

  it("browser readings in m/s² work once converted to g", () => {
    const fired = vi.fn(); const off = onShakeSOS(fired);
    for (let i = 0; i < SHAKES_NEEDED; i++) feedAcceleration(25 / 9.81, 3 / 9.81, 2 / 9.81, 400_000 + i * 300);
    expect(fired).toHaveBeenCalledTimes(1);
    off();
  });
});
