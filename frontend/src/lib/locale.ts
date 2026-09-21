export type Language = "de" | "en";

export const LOCALE_COOKIE = "locale";

// Not httpOnly -- written from the client so the server-side request config
// (src/i18n/request.ts) can read it on the next render without a round trip.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Writes the locale cookie only when it differs, then reads it back to
// confirm the write actually landed (e.g. blocked cookies fail silently).
// Only a confirmed write should trigger a router.refresh() -- otherwise a
// blocked cookie would cause an infinite refresh loop (mismatch persists,
// refresh re-checks, mismatch persists, ...).
export function syncLocaleCookie(language: Language): boolean {
  if (readCookie(LOCALE_COOKIE) === language) return false;

  document.cookie = `${LOCALE_COOKIE}=${language}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;

  return readCookie(LOCALE_COOKIE) === language;
}
