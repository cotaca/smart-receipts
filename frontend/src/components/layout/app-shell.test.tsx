import { render, screen } from "@testing-library/react";
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
};

describe("AppShell", () => {
  // jsdom applies no CSS, so a viewport width here would prove nothing: the
  // trigger is in the DOM at every width and only `md:hidden` keeps it off
  // desktop. Assert that class explicitly -- swapping it for plain `hidden`
  // would silently leave mobile with no way to reach nav, theme or sign-out.
  it("renders a sidebar trigger that is visible only below the md breakpoint", () => {
    render(
      <AppShell me={ME}>
        <div>content</div>
      </AppShell>,
    );

    const trigger = screen.getByRole("button", { name: /toggle sidebar/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass("md:hidden");
  });
});
