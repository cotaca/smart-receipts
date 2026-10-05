import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";

import { MobileBottomNav, MobileTopBar, UploadFab } from "./mobile-nav";

let pathname = "/dashboard";
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace }),
}));

const ME = {
  id: "1",
  email: "jane@example.com",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  number_format: "de-DE" as const,
  default_currency: "EUR" as const,
  language: "de" as const,
};

beforeEach(() => {
  pathname = "/dashboard";
  window.history.replaceState(null, "", "/receipts");
});

afterEach(() => {
  vi.restoreAllMocks();
  push.mockClear();
  replace.mockClear();
});

describe("MobileBottomNav", () => {
  it("links the three destinations and marks the current one", () => {
    render(<MobileBottomNav />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveClass("md:hidden");
    expect(screen.getAllByRole("link")).toHaveLength(3);
    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveAttribute("href", "/dashboard");
    expect(dashboard).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Receipts" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});

describe("UploadFab", () => {
  it("opens the list's upload dialog from another page", async () => {
    window.history.replaceState(null, "", "/receipts?q=milch");
    render(<UploadFab />);
    await userEvent.click(
      screen.getByRole("button", { name: "Upload receipt" }),
    );
    expect(push).toHaveBeenCalledWith("/receipts?upload=1");
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps the list's filters", async () => {
    pathname = "/receipts";
    window.history.replaceState(null, "", "/receipts?q=milch");
    render(<UploadFab />);
    await userEvent.click(
      screen.getByRole("button", { name: "Upload receipt" }),
    );
    expect(replace).toHaveBeenCalledWith("/receipts?q=milch&upload=1");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("MobileTopBar", () => {
  it("offers theme and sign out in the account menu", async () => {
    const logout = vi.spyOn(api, "logout").mockResolvedValue(undefined);
    render(<MobileTopBar me={ME} />);

    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(
      await screen.findByRole("menuitem", { name: "Toggle theme" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(logout).toHaveBeenCalled();
  });
});
