import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { LOCALE_COOKIE, type Language } from "@/lib/locale";

const SUPPORTED: Language[] = ["de", "en"];

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
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
