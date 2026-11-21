/**
 * PII masking before ANY model call (P2.3). Applied to every text message the gateway sends.
 * Masks: Indian mobile numbers, 12-digit Aadhaar-like numbers, e-mail addresses, PIN codes after address words,
 * and house/flat addresses (English + Hindi/Devanagari forms). Masking is irreversible on purpose.
 */
const RULES: Array<[RegExp, string]> = [
  // e-mail
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]"],
  // Aadhaar-like: 12 digits, optionally grouped 4-4-4 (also Devanagari digits)
  [/(?<![\d०-९])(?:[2-9२-९][\d०-९]{3}[\s-]?[\d०-९]{4}[\s-]?[\d०-९]{4})(?![\d०-९])/g, "[ID_NUMBER]"],
  // Indian mobile numbers with optional +91 / 0 prefix (also Devanagari digits)
  [/(?<![\d०-९])(?:\+?91[\s-]?|0)?[6-9६-९][\d०-९]{4}[\s-]?[\d०-९]{5}(?![\d०-९])/g, "[PHONE]"],
  // House / flat / plot numbers — English
  [/\b(?:house|h\.?\s?no|flat|plot|door|qtr|quarter)\.?\s*(?:no\.?|number|#)?\s*[:\-]?\s*[\w/-]{1,8}\b/gi, "[ADDRESS]"],
  // House numbers — Hindi (मकान नं / मकान नंबर / म.नं / फ्लैट)
  [/(?:मकान|म\.|फ्लैट|प्लॉट)\s*(?:नं\.?|नंबर|संख्या)?\s*[:\-]?\s*[\w०-९/-]{1,8}/g, "[ADDRESS]"],
  // 6-digit postal PIN codes (only right after an address-ish word, to avoid masking ticket numbers)
  [/(?:pin\s*code|pincode|पिन\s*कोड|पिनकोड)\s*[:\-]?\s*[1-9१-९][\d०-९]{5}/gi, "[PINCODE]"],
];

export function maskPII(text: string): string {
  return RULES.reduce((t, [re, rep]) => t.replace(re, rep), text);
}

/** True if text still looks like it contains a phone/ID — used by tests and as a last guard. */
export function looksLikePII(text: string): boolean {
  return /(?<!\d)[6-9]\d{9}(?!\d)/.test(text) || /(?<!\d)\d{4}\s?\d{4}\s?\d{4}(?!\d)/.test(text) || /@[\w-]+\.\w{2,}/.test(text);
}
