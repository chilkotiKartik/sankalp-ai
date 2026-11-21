import { isKnownDistrict, stateLabel } from "../data/reference";
import { z } from "zod";
import { StateError } from "../storage";
import { TransitionError } from "../domain/complaintState";
import { AppError } from "../lib/errors";

export const phone10 = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");
export const pin6 = z.string().regex(/^\d{6}$/, "PIN must be 6 digits");
export const geo = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export const district = z.string().trim().min(2).max(60);
/** District of the CURRENT tenant (validated at request time, not at boot — P1.8). */
export const tenantDistrict = z.string().trim().refine(d => isKnownDistrict(d), { message: "Unknown district for this state" });
/** A district, or the state-wide label for state-level staff. */
export const tenantDistrictOrState = z.string().trim().refine(d => isKnownDistrict(d) || d === stateLabel(), { message: "Unknown district for this state" });
export const text = (max: number) => z.string().trim().max(max);
export const CATEGORIES = ["pothole", "garbage", "streetlight", "water", "drain", "electricity", "tree", "other", "road_damage", "sewage", "transformer", "noise", "health_hazard", "disaster"] as const;
export const SOS_CATEGORIES = ["gas_leak", "water_burst", "electric_hazard", "fire_risk", "road_accident", "infrastructure", "women_safety", "medical", "disaster", "forest_fire"] as const;
export const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;

/** Map domain errors to HTTP errors. */
export function domain<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof TransitionError) throw new AppError(409, "INVALID_TRANSITION", `This action is not allowed while the complaint is ${e.from}`);
    if (e instanceof StateError) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : e.code === "PROOF_REQUIRED" ? 422 : 409;
      throw new AppError(status, e.code, e.message);
    }
    throw e;
  }
}
