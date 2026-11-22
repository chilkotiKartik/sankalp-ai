/**
 * PII masking before ANY model call (P2.3). Applied to every text the gateway sends.
 * Masks: phone numbers and 12-digit ID (Aadhaar-like) numbers in any common grouping (spaces, dots, dashes,
 * brackets, +91/0 prefix, Devanagari digits), e-mail addresses, house/flat/plot numbers (English + Hindi forms),
 * and 6-digit PIN codes. Masking is irreversible on purpose.
 *
 * Review P2-1: address rules need a NUMBER after the keyword, so civic phrases such as "door to door garbage",
 * "near my house drain" or "flat tyre" are left intact (the model needs them to classify).
 */
const DEV = "०१२३४५६७८९";
const toAscii = (s: string) => s.replace(/[०-९]/g, d => String(DEV.indexOf(d)));

// A digit (ASCII or Devanagari) and an allowed separator between digits.
const D = "[0-9०-९]";
const SEP = "[\\s.\\-()]{0,2}";

/** Runs of 10–14 digits with separators between them. Classified by their digit count after normalisation. */
const DIGIT_RUN = new RegExp(`(?<![0-9०-९])(?:\\+${SEP})?${D}(?:${SEP}${D}){9,13}(?![0-9०-९])`, "g");

function maskDigitRun(m: string): string {
  const digits = toAscii(m).replace(/\D/g, "");
  if (digits.length === 12 && /^[2-9]/.test(digits) && !/^91[6-9]/.test(digits)) return "[ID_NUMBER]";
  const local = digits.replace(/^(?:91|0)(?=[6-9]\d{9}$)/, "");
  if (local.length === 10 && /^[6-9]/.test(local)) return "[PHONE]";
  if (digits.length >= 10) return "[NUMBER]"; // long identifiers of unknown kind are never sent
  return m;
}

const RULES: Array<[RegExp, string]> = [
  // e-mail (also with Devanagari in the local part)
  [/[\p{L}\p{M}\p{N}._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu, "[EMAIL]"],
  // House / flat / plot / door numbers — English: keyword + optional "no." + a token that starts with a digit
  [/\b(?:house|h\.?\s?no|flat|plot|door|qtr|quarter|khasra)\s*(?:no\.?|number|num|#)?\s*[:\-]?\s*\d[\w/-]{0,7}/gi, "[ADDRESS]"],
  // House numbers — Hindi (मकान/घर/हाउस/फ्लैट/प्लॉट + नं./नंबर/नम्बर/संख्या + number). No match inside words.
  [/(?<![ऀ-ॿ])(?:मकान|घर|हाउस|फ्लैट|प्लॉट|म\.)\s*(?:नं\.?|नंबर|नम्बर|संख्या|न\.)?\s*[:\-]?\s*[0-9०-९][\w०-९/-]{0,7}/g, "[ADDRESS]"],
  // 6-digit PIN codes: after a PIN keyword, or a bare 6-digit number (Indian PINs start 1–8)
  [/(?:pin\s*code|pincode|pin|पिन\s*कोड|पिनकोड)\s*[:\-]?\s*[1-8१-८](?:\s?[0-9०-९]){5}(?![0-9०-९])/gi, "[PINCODE]"],
  [/(?<![0-9०-९\-/])[1-8१-८][0-9०-९]{2}\s?[0-9०-९]{3}(?![0-9०-९\-/])/g, "[PINCODE]"],
];

export function maskPII(text: string): string {
  let t = text.replace(DIGIT_RUN, maskDigitRun);
  for (const [re, rep] of RULES) t = t.replace(re, rep);
  return t;
}

/** Last guard (review P2-2): true if text still looks like it contains a phone, ID number or e-mail. */
export function looksLikePII(text: string): boolean {
  const digits = toAscii(text).replace(/(?<=\d)[\s.\-()]{1,2}(?=\d)/g, "");
  return /(?<!\d)(?:91|0)?[6-9]\d{9}(?!\d)/.test(digits) || /(?<!\d)[2-9]\d{11}(?!\d)/.test(digits) || /@[\w-]+\.\w{2,}/.test(text);
}
