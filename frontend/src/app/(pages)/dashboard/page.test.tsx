import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as api from "@/lib/api";
import type { Dashboard, Me } from "@/lib/api";
import { MeProvider } from "@/lib/me-context";

import DashboardPage from "./page";

const ME: Me = {
  id: "1",
  email: "jane@example.com",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  number_format: "de-DE",
  default_currency: "EUR",
  language: "de",
};

const DATA: Dashboard = {
  currency: "EUR",
  excluded_count: 0,
  this_month: "1234.50",
  last_month: "1000.00",
  this_month_count: 3,
  this_month_average: "411.50",
  busiest_merchant: { name: "REWE", count: 2, total: "900.00" },
  monthly: [{ month: "2026-03-01", total: "1234.50" }],
  top_merchants: [{ name: "REWE", count: 2, total: "900.00" }],
  top_products: [{ name: "Milch", count: 7, total: "8.40" }],
  recent: [
    {
      id: "r1",
      merchant: "REWE Markt",
      amount: "42.18",
      currency: "EUR",
      purchased_at: "2026-03-14",
    },
  ],
};

function renderPage(me: Me = ME) {
  return render(
    <MeProvider me={me} setMe={vi.fn()}>
      <DashboardPage />
    </MeProvider>,
  );
}

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.spyOn(api, "getDashboard").mockResolvedValue(DATA);
});

describe("DashboardPage", () => {
  it("leaves the main landmark to the app shell", () => {
    // The shell's SidebarInset is the one <main>; a page's own would nest a
    // second main landmark inside it (invalid HTML, two "main" landmarks).
    renderPage();
    expect(screen.queryByRole("main")).toBeNull();
  });

  it("formats the KPIs per number_format", async () => {
    const { unmount } = renderPage();

    expect(await screen.findByText("1.234,50 EUR")).toBeInTheDocument();
    expect(screen.getByText("411,50 EUR")).toBeInTheDocument();
    expect(screen.getByText("+23,5 %")).toBeInTheDocument();

    unmount();
    renderPage({ ...ME, number_format: "en-US" });
    expect(await screen.findByText("1,234.50 EUR")).toBeInTheDocument();
    expect(screen.getByText("+23.5%")).toBeInTheDocument();
  });

  it("hides the change when last month is zero", async () => {
    vi.spyOn(api, "getDashboard").mockResolvedValue({
      ...DATA,
      last_month: "0.00",
    });
    renderPage();

    await screen.findByText("1.234,50 EUR");
    expect(screen.queryByText(/vs last month/)).not.toBeInTheDocument();
  });

  it("shows a negative change with a minus sign", async () => {
    vi.spyOn(api, "getDashboard").mockResolvedValue({
      ...DATA,
      this_month: "877.00",
    });
    renderPage();

    expect(await screen.findByText("-12,3 %")).toBeInTheDocument();
  });

  it("hides the change when last month is negative", async () => {
    vi.spyOn(api, "getDashboard").mockResolvedValue({
      ...DATA,
      last_month: "-5.00",
    });
    renderPage();

    await screen.findByText("1.234,50 EUR");
    expect(screen.queryByText(/vs last month/)).not.toBeInTheDocument();
  });

  it("refetches with the new period", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("1.234,50 EUR");
    expect(api.getDashboard).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      "last-12-months",
    );

    await user.click(screen.getByRole("combobox", { name: "Period" }));
    await user.click(await screen.findByRole("option", { name: "Last year" }));

    await waitFor(() =>
      expect(api.getDashboard).toHaveBeenLastCalledWith(
        expect.any(String),
        "last-year",
      ),
    );
  });

  it("shows the excluded-currency hint", async () => {
    vi.spyOn(api, "getDashboard").mockResolvedValue({
      ...DATA,
      excluded_count: 2,
    });
    renderPage();

    expect(
      await screen.findByText(/2 receipts in other currencies are not counted/),
    ).toBeInTheDocument();
  });

  it("shows the empty state when there are no receipts at all", async () => {
    vi.spyOn(api, "getDashboard").mockResolvedValue({
      ...DATA,
      recent: [],
      excluded_count: 0,
    });
    renderPage();

    expect(await screen.findByText("No receipts yet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Upload receipt" }),
    ).toHaveAttribute("href", "/receipts?upload=1");
  });

  it("shows an alert when loading fails", async () => {
    vi.spyOn(api, "getDashboard").mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load the dashboard",
    );
  });

  it("links recent receipts to the receipt detail", async () => {
    renderPage();

    const link = await screen.findByRole("link", { name: /REWE Markt/ });
    expect(link).toHaveAttribute("href", "/receipts?receipt=r1");
  });
});
