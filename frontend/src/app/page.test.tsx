import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";

import HomePage from "./page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

describe("HomePage", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it("redirects to /login when the silent refresh fails", async () => {
    vi.spyOn(api, "refresh").mockRejectedValue(new api.ApiError(401, "401"));

    render(<HomePage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("renders the receipts shell with the user's initials once authenticated", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue({
      access_token: "token",
      token_type: "bearer",
    });
    vi.spyOn(api, "getMe").mockResolvedValue({
      id: "1",
      email: "jane@example.com",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
    });

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByText("Receipts")).toBeInTheDocument(),
    );
    expect(screen.getByText("No receipts yet")).toBeInTheDocument();
    expect(screen.getByText("JA")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
