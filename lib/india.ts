/** m17: Indian input helpers shared by the app (the server applies the same rules). */
export function normalizeIndianMobile(v: string): string {
  const d = v.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (/^91[6-9]\d{9}$/.test(d)) return d.slice(2);
  if (/^0[6-9]\d{9}$/.test(d)) return d.slice(1);
  return d;
}
export const isIndianMobile = (v: string) => /^[6-9]\d{9}$/.test(normalizeIndianMobile(v));
export const toE164 = (v: string) => `+91${normalizeIndianMobile(v)}`;
export const isPincode = (v: string) => /^[1-8]\d{5}$/.test(v.trim());
