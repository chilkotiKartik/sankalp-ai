/**
 * Sankalp Points (D-059): earned only for real, checked outcomes — never just for posting.
 * Filing a complaint earns nothing by itself; points come when an officer accepts it and when the fix is verified.
 * Nothing is awarded for SOS (no incentive to raise a false alarm), and daily caps stop farming.
 */
export type PointsReason =
  | "complaint_accepted" | "complaint_fixed" | "verification_answered" | "neighbour_verified"
  | "upvote_given" | "unsafe_area_reported" | "earlier_activity";

export const POINT_RULES: Record<Exclude<PointsReason, "earlier_activity">, { points: number; dailyCap?: number; en: string; hi: string }> = {
  complaint_accepted: { points: 3, en: "Your complaint was accepted by the department", hi: "आपकी शिकायत विभाग ने स्वीकार की" },
  complaint_fixed: { points: 10, en: "Your complaint was fixed and verified", hi: "आपकी शिकायत ठीक हुई और सत्यापित हुई" },
  verification_answered: { points: 5, en: "You confirmed whether the fix was real", hi: "आपने बताया कि काम सच में हुआ या नहीं" },
  neighbour_verified: { points: 3, dailyCap: 5, en: "You checked a neighbour's repair", hi: "आपने पड़ोस की मरम्मत की जाँच की" },
  upvote_given: { points: 1, dailyCap: 5, en: "You supported someone else's complaint", hi: "आपने किसी और की शिकायत का समर्थन किया" },
  unsafe_area_reported: { points: 2, dailyCap: 3, en: "You reported an unsafe area", hi: "आपने असुरक्षित जगह की सूचना दी" },
};

export const LEVELS = [
  { n: 1, min: 0, name: "Nagrik", en: "Citizen" },
  { n: 2, min: 50, name: "Sajag", en: "Alert citizen" },
  { n: 3, min: 150, name: "Sahayak", en: "Helper" },
  { n: 4, min: 400, name: "Sevak", en: "Community servant" },
  { n: 5, min: 1000, name: "Rakshak", en: "Guardian" },
  { n: 6, min: 2500, name: "Sankalp Ratna", en: "Jewel of Sankalp" },
] as const;

export function levelFor(points: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i++;
  const cur = LEVELS[i], next = LEVELS[i + 1];
  return {
    n: cur.n, name: cur.name, en: cur.en, min: cur.min,
    next: next ? { n: next.n, name: next.name, en: next.en, min: next.min, need: next.min - points } : null,
    progress: next ? Math.max(0, Math.min(1, (points - cur.min) / (next.min - cur.min))) : 1,
  };
}

/** Badges are earned from real counts in the ledger — never granted by hand. */
export const BADGES: Array<{ id: string; name: string; desc: string; reason: PointsReason; count: number }> = [
  { id: "first_fix", name: "First fix", desc: "One of your complaints was fixed and verified", reason: "complaint_fixed", count: 1 },
  { id: "fix_5", name: "Change maker", desc: "5 of your complaints were fixed and verified", reason: "complaint_fixed", count: 5 },
  { id: "fix_25", name: "Ward champion", desc: "25 of your complaints were fixed and verified", reason: "complaint_fixed", count: 25 },
  { id: "honest_5", name: "Honest verifier", desc: "You answered 5 times whether a fix was real", reason: "verification_answered", count: 5 },
  { id: "neighbour_3", name: "Neighbourhood watch", desc: "You checked 3 repairs in your area", reason: "neighbour_verified", count: 3 },
  { id: "safety_3", name: "Safety lookout", desc: "You reported 3 unsafe areas", reason: "unsafe_area_reported", count: 3 },
  { id: "accepted_10", name: "Trusted reporter", desc: "10 of your complaints were accepted by departments", reason: "complaint_accepted", count: 10 },
];
