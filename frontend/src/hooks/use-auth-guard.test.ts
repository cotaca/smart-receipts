import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";

import { useAuthGuard } from "./use-auth-guard";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh }),
}));

function mockMe(language: "de" | "en") {
  vi.spyOn(api, "refresh").mockResolvedValue({
    access_token: "token",
    token_type: "bearer",
  });
  vi.spyOn(api, "getMe").mockResolvedValue({
    id: "1",
    email: "jane@example.com",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    number_format: "de-DE",
    default_currency: "EUR",
    language,
  });
}

beforeEach(() => {
  replace.mockClear();
  refresh.mockClear();
  // Clear any cookie a previous test wrote.
  document.cookie = "locale=; Path=/; Max-Age=0";
});

describe("useAuthGuard", () => {
  it("redirects to /login when the silent refresh fails", async () => {
    vi.spyOn(api, "refresh").mockRejectedValue(new api.ApiError(401, "401"));

    renderHook(() => useAuthGuard());

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("resolves the current user when the silent refresh succeeds", async () => {
    mockMe("de");

    const { result } = renderHook(() => useAuthGuard());

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.me?.email).toBe("jane@example.com");
    expect(replace).not.toHaveBeenCalled();
  });

  it("writes the locale cookie and refreshes when the account language differs from the cookie", async () => {
    document.cookie = "locale=en; Path=/";
    mockMe("de");

    const { result } = renderHook(() => useAuthGuard());

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(document.cookie).toContain("locale=de");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // Regression test: syncLocaleCookie must only trigger router.refresh() on
  // a confirmed write, or a mismatch that can't be written (e.g. blocked
  // cookies) would refresh forever without ever fixing itself.
  it("does not call router.refresh() when the cookie already matches the account language", async () => {
    document.cookie = "locale=de; Path=/";
    mockMe("de");

    const { result } = renderHook(() => useAuthGuard());

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(refresh).not.toHaveBeenCalled();
  });
});
