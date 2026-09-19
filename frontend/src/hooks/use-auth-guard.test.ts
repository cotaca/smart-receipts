import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";

import { useAuthGuard } from "./use-auth-guard";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

beforeEach(() => {
  replace.mockClear();
});

describe("useAuthGuard", () => {
  it("redirects to /login when the silent refresh fails", async () => {
    vi.spyOn(api, "refresh").mockRejectedValue(new api.ApiError(401, "401"));

    renderHook(() => useAuthGuard());

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("resolves the current user when the silent refresh succeeds", async () => {
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
    });

    const { result } = renderHook(() => useAuthGuard());

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.me?.email).toBe("jane@example.com");
    expect(replace).not.toHaveBeenCalled();
  });
});
