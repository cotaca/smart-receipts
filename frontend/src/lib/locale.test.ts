import { afterEach, describe, expect, it } from "vitest";

import { LOCALE_COOKIE, syncLocaleCookie } from "./locale";

afterEach(() => {
  document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0`;
});

describe("syncLocaleCookie", () => {
  it("writes the cookie and returns true when the write lands", () => {
    expect(syncLocaleCookie("de")).toBe(true);
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=de`);
  });

  // Regression test: this is the read-back guard that stops the infinite
  // refresh loop. If a blocked write ever reported true, useAuthGuard would
  // refresh forever without the mismatch ever resolving.
  it("returns false when the write is blocked (e.g. cookies disabled)", () => {
    Object.defineProperty(document, "cookie", {
      get: () => "",
      set: () => {},
      configurable: true,
    });

    try {
      expect(syncLocaleCookie("de")).toBe(false);
    } finally {
      // Drop the instance override so jsdom's own accessor (on
      // Document.prototype) takes back over for later tests.
      delete (document as { cookie?: string }).cookie;
    }
  });
});
