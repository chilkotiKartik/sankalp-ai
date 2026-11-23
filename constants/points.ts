import type { Ionicons } from "@expo/vector-icons";

/** Sankalp Points badges and levels (must match server/domain/points.ts — D-059). */
export const BADGE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  first_fix: { icon: "checkmark-done-circle", color: "#047857", label: "First fix" },
  fix_5: { icon: "construct", color: "#2563EB", label: "Change maker" },
  fix_25: { icon: "trophy", color: "#B45309", label: "Ward champion" },
  honest_5: { icon: "shield-checkmark", color: "#7C3AED", label: "Honest verifier" },
  neighbour_3: { icon: "people", color: "#0E7490", label: "Neighbourhood watch" },
  safety_3: { icon: "moon", color: "#BE185D", label: "Safety lookout" },
  accepted_10: { icon: "ribbon", color: "#C2410C", label: "Trusted reporter" },
};

export const LEVEL_NAMES: Record<number, { name: string; en: string }> = {
  1: { name: "Nagrik", en: "Citizen" }, 2: { name: "Sajag", en: "Alert citizen" }, 3: { name: "Sahayak", en: "Helper" },
  4: { name: "Sevak", en: "Community servant" }, 5: { name: "Rakshak", en: "Guardian" }, 6: { name: "Sankalp Ratna", en: "Jewel of Sankalp" },
};

export const REASON_LABEL: Record<string, string> = {
  complaint_accepted: "Complaint accepted by the department",
  complaint_fixed: "Complaint fixed and verified",
  verification_answered: "You confirmed whether the fix was real",
  neighbour_verified: "You checked a neighbour's repair",
  upvote_given: "You supported someone's complaint",
  unsafe_area_reported: "You reported an unsafe area",
  earlier_activity: "Points from earlier activity",
};

/** Points needed for each level (same as the server). */
export const LEVEL_MIN = [0, 50, 150, 400, 1000, 2500];
export function levelProgress(points: number) {
  let i = 0;
  while (i + 1 < LEVEL_MIN.length && points >= LEVEL_MIN[i + 1]) i++;
  const next = LEVEL_MIN[i + 1];
  return { level: i + 1, into: points - LEVEL_MIN[i], span: next ? next - LEVEL_MIN[i] : 0, progress: next ? (points - LEVEL_MIN[i]) / (next - LEVEL_MIN[i]) : 1 };
}
