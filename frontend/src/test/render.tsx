import {
  render as rtlRender,
  type RenderOptions,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";

import enMessages from "../../messages/en.json";

// Every component under test calls useTranslations(), so it needs the
// provider next-intl's client hook reads from -- jsdom has no server request
// to run src/i18n/request.ts, and the tests only ever assert English copy.
export function render(ui: ReactElement, options?: RenderOptions) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>,
    options,
  );
}

export * from "@testing-library/react";
