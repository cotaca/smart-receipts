import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { LOCALE_COOKIE, type Language } from "@/lib/locale";

import de from "../../messages/de.json";
import en from "../../messages/en.json";

// Static imports, not `import(`../../messages/${locale}.json`)`: `next dev`
// never invalidated the template-string import, so edited catalogs kept
// serving the old strings (raw keys, MISSING_MESSAGE) until a restart.
const MESSAGES = { de, en };
const SUPPORTED = Object.keys(MESSAGES) as Language[];

// No cookie yet (first visit) -- guess from Accept-Language so the very
// first render isn't always German, then fall back to the account default.
function guessFromAcceptLanguage(acceptLanguage: string | null): Language {
  if (acceptLanguage?.toLowerCase().startsWith("en")) return "en";
  return "de";
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale: Language;
  if (cookieLocale && SUPPORTED.includes(cookieLocale as Language)) {
    locale = cookieLocale as Language;
  } else {
    const headerStore = await headers();
    locale = guessFromAcceptLanguage(headerStore.get("accept-language"));
  }

  return {
    locale,
    messages: MESSAGES[locale],
  };
});
