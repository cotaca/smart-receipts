import { render, screen } from "@/test/render";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

describe("AppShell", () => {
  // jsdom applies no CSS: the bars are in the DOM at every width, and only
  // `md:hidden` keeps them off desktop (where the sidebar takes over).
  it("renders the mobile top bar and bottom nav, hidden from md up", () => {
    render(
      <AppShell me={ME}>
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByRole("navigation", { name: "Main" })).toHaveClass(
      "md:hidden",
    );
    // Outside <main>, so it is a real banner landmark (inside it would be
    // a plain header; jsdom's role query alone can't tell).
    const banner = screen.getByRole("banner");
    expect(banner).toHaveClass("md:hidden");
    expect(banner.closest("main")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Account menu" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload receipt" })).toHaveClass(
      "md:hidden",
    );
  });
});
