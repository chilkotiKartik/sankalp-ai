/**
 * fetch with a time limit. Startup requests use it so a weak phone connection can never leave the app waiting
 * forever (the cause of a blank screen): after the limit the caller falls back to its saved copy.
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}
