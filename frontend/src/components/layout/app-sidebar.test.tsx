import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";

import { AppSidebar } from "./app-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
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

function renderSidebar() {
  return render(
    <SidebarProvider>
      <AppSidebar me={ME} />
    </SidebarProvider>,
  );
}

describe("AppSidebar", () => {
  it("links to each workspace route and marks the active one", () => {
    renderSidebar();

    const dashboardLink = screen.getByRole("link", { name: /Dashboard/ });
    const receiptsLink = screen.getByRole("link", { name: /Receipts/ });
    const settingsLink = screen.getByRole("link", { name: /Settings/ });

    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
    expect(receiptsLink).toHaveAttribute("href", "/");
    expect(settingsLink).toHaveAttribute("href", "/settings");

    // usePathname is mocked to "/dashboard" — only that item should be active.
    expect(dashboardLink).toHaveAttribute("data-active");
    expect(receiptsLink).not.toHaveAttribute("data-active");
    expect(settingsLink).not.toHaveAttribute("data-active");
  });

  it("shows the signed-in user's email in the footer", () => {
    renderSidebar();

    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });
});
